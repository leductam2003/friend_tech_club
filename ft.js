const fs = require('fs')
    , ini = require('ini')
    , ethers = require('ethers')
    , inquirer = require('inquirer');

const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
const batchWalletsPrivateKeys = (fs.readFileSync('./wallets.txt', 'utf-8')).trim().split('\n');
const FRIEND_TOKEN_ADDR = '0x0bd4887f7d41b35cd75dff9ffee2856106f86670';
const FRIEND_TECH_CONTRACT_ADDRESS = '0x201e95f275f39a5890c976dc8a3e1b4af114e635';
const { friend_tech, friend_token } = require('./abi')
const provider = new ethers.JsonRpcProvider(config.settings.rpc);


function logWithTime(message, type = 'info') {
    const date = new Date();
    const time = date.toLocaleTimeString('vi-VN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    if (type == 'r') {
        console.error('\x1b[31m%s\x1b[0m', `[ERROR] [${time}.${milliseconds}] ${message}`);
    }
    if (type == 'i') {
        console.log(`[INFO] [${time}.${milliseconds}] ${message}`);
    }
    if (type == 's') {
        console.log('\x1b[32m%s\x1b[0m', `[SUCCESS] [${time}.${milliseconds}] ${message}`);
    }
}

async function execute_task() {
    let continueExecution = true;
    while (continueExecution) {
        const tasks = batchWalletsPrivateKeys.map(async (privateKey) => {
            const action = await promptAction();
            const club_id = await promptClubId();
            const amount = await promptAmount();
            if (action === 'Buy') {
                await buy(privateKey.replace('\r', ''), club_id, amount);
            }
            if (action === 'Approval') {
                await approval(privateKey.replace('\r', ''));
            }
            if (action === 'Sell') {
                await sell(privateKey.replace('\r', ''), club_id, amount);
            }
        });
        await Promise.all(tasks);
        const { continueExecutionAnswer } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'continueExecutionAnswer',
                message: 'Do you want to continue?',
                default: true
            }
        ]);
        continueExecution = continueExecutionAnswer;
    }
}

async function promptAction() {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'Select an action:',
            choices: ['Buy', 'Sell', 'Approval']
        }
    ]);
    return action;
}

async function promptClubId() {
    const { clubId } = await inquirer.prompt([
        {
            type: 'input',
            name: 'clubId',
            message: 'Enter club ID:'
        }
    ]);
    return clubId;
}

async function promptAmount() {
    const { amount } = await inquirer.prompt([
        {
            type: 'input',
            name: 'amount',
            message: 'Enter amount:'
        }
    ]);
    return amount;
}


async function approval(privateKey) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const FRIEND_TOKEN = new ethers.Contract(FRIEND_TOKEN_ADDR, friend_token, wallet);
    const allowance = await FRIEND_TOKEN.allowance(wallet.address, FRIEND_TECH_CONTRACT_ADDRESS)
    if (allowance <= 0) {
        const approve = await FRIEND_TOKEN.approve(
            FRIEND_TECH_CONTRACT_ADDRESS,
            BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')
        )
        logWithTime(`${wallet.address} | Approved, waitting for confirmation...`, "s")
        await approve.wait()
    }
    return true
}
async function buy(privateKey, clubId, amt) {
    const match = clubId.match(/\b\d+\b/);
    if (match) {
        const club_id = match[0];
        const wallet = new ethers.Wallet(privateKey, provider)
        const FRIEND_TECH_CONTRACT = new ethers.Contract(FRIEND_TECH_CONTRACT_ADDRESS, friend_tech, wallet);
        const FRIEND_TOKEN = new ethers.Contract(FRIEND_TOKEN_ADDR, friend_token, wallet);
        const friend_balance = await FRIEND_TOKEN.balanceOf(wallet.address);
        logWithTime(`${wallet.address} | ${ethers.formatEther(friend_balance)} FRIEND`, "i")
        let isMinted = false;
        while (!isMinted) {
            try {
                if (friend_balance > 0) {
                    const swap = await FRIEND_TECH_CONTRACT.buyToken(
                        parseInt(club_id),
                        BigInt(config.settings.max_token_in),
                        parseInt(amt),
                        config.settings.referral_address
                    )
                    logWithTime(`${wallet.address} | Bought x${amt} #${club_id}`, "s")
                    isMinted = true
                    return true
                } else {
                    logWithTime(`FRIEND balance <= 0`, 'r')
                    return false
                }
            } catch (error) {
                logWithTime(`${wallet.address} | ${error.message}`, 'r')
            }
            await new Promise(resolve => setTimeout(resolve, parseInt(config.settings.delay)));
        }
    } else {
        console.log('Club id not valid!!!')
    }

}
async function sell(privateKey, clubId, amt) {
    const match = clubId.match(/\b\d+\b/);
    if (match) {
        const club_id = match[0];
        const wallet = new ethers.Wallet(privateKey, provider);
        const FRIEND_TECH_CONTRACT = new ethers.Contract(FRIEND_TECH_CONTRACT_ADDRESS, friend_tech, wallet);
        const FRIEND_TOKEN = new ethers.Contract(FRIEND_TOKEN_ADDR, friend_token, wallet);
        const friend_balance = await FRIEND_TOKEN.balanceOf(wallet.address);
        logWithTime(`${wallet.address} | ${ethers.formatEther(friend_balance)} FRIEND`, "i")
        let isMinted = false;
        while (!isMinted) {
            try {
                const swap = await FRIEND_TECH_CONTRACT.sellToken(
                    parseInt(club_id),
                    parseInt(config.settings.min_token_out),
                    parseInt(amt),
                    config.settings.referral_address
                )
                logWithTime(`${wallet.address} | Sold x${amt} #${club_id}`, "s")
                isMinted = true
                return true

            } catch (error) {
                logWithTime(`${wallet.address} | ${error.message}`, 'r')
            }
            await new Promise(resolve => setTimeout(resolve, parseInt(config.settings.delay)));
        }
    } else {
        console.log('Club id not valid!!!')
    }

}

(async () => {
    await execute_task()
})();
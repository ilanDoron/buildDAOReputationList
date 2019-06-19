//web3 modules
const Web3 = require('web3');

//general purpose npm moudles
const fs = require('fs');
const assert = require('assert');
const solc = require('solc');
const syncParse = require('csv-parse/lib/sync')

const tradersFilePath = './input/trade_reports.csv';
const kyberTeamFileName = './input/kyberTeam.json';
const prevPollFileName = './input/previous_poll_addresses.json';
const holdersAddressFileName = './potentialHolders.json';
const balancesFileName = './KNCBalance.json';
const sortedBalancesFileName = './KNCBalanceSorted.json';
const feeSharingWalletsFile = './feeSharingWalletsAdds.json';
const reservesKncWalletsFile = './reserveKncWalletsAdds.json';
const reputationScorePath = './kyberDAOReputationScore.json';
const daoFoundersPath = './output/kyberDAOFounders.json';0


process.on('unhandledRejection', console.error.bind(console))


////////
const mainnetUrls = ['https://mainnet.infura.io',
                     'https://semi-node.kyber.network',
                     'https://api.mycryptoapi.com/eth',
                     'https://api.myetherapi.com/eth',
                     'https://mew.giveth.io/'];

const kovanPublicNode = 'https://kovan.infura.io';
const ropstenPublicNode = 'https://ropsten.infura.io';
const nodeURL = mainnetUrls[1];
web3 = new Web3(new Web3.providers.HttpProvider(nodeURL));

let solcOuput;
let latest;

const balanceWaterMark = 999;
const KNCBalanceBlockDec = 7975535;

const KNCBalanceBlock = '0x79B26F';
const KNCBalanceBlockHash = '0xd9daa90984da1f4f33e9741616401e87c9bd057312d92e744a78ff98d657b46d';
const kncTokenAddress = '0xdd974d5c2e2928dea5f71b9825b8b646686bd200';
const KNCCreationBlock = 4264898;
const KNCPrecision = web3.utils.toBN(10 ** 18);
let totalTransferEvents = 0;

const feeBurnerAddress = '0x52166528FCC12681aF996e409Ee3a421a4e128A3';
const feeBurnerCreationBlock = 7003119;

const numBlocksPerQuery = 30000;
const numQueriesPerRun = 10;

const minTradeVolumeEth = 2;

//contract sources
const contractPath = "./contracts/";

const input = {
    "ERC20.sol" : fs.readFileSync(contractPath + 'ERC20.sol', 'utf8'),
    "GetBalance.sol" : fs.readFileSync(contractPath + 'GetBalance.sol', 'utf8'),
    "FeeBurnerInterface.sol" : fs.readFileSync(contractPath + 'FeeBurnerInterface.sol', 'utf8')
}


main();



async function main() {

    myLog(0, 0, "starting compilation");
    solcOutput = await solc.compile({ sources: input }, 1);
    console.log(solcOutput.errors);

    myLog(0, 0, "finished compilation");

    myLog(1, 0, "read traders CSV");
    let tradersVolumeEth = await readTradersCSV();
    await connectToChain();

    latest = await web3.eth.getBlockNumber();
    console.log("latest block: " + latest);

    let feeSharingWallets = await getFeeSharingWallets();

    let reserveKncWalletsAdds = await getReserveKNCwalletAddresses();

    let kyberTeamAdds = getKyberTeamAddresses();

    let prevPollAdds = getPreviousPollAddresses();

    let potentialHolders = await getKncPotentialHolders();

    let kncHoldersAboveMinBalance = await getKncHoldersAboveMinBal(potentialHolders, balanceWaterMark);

    // can create sorted balance array. for comparing.
//    let sortedBalanceDict = await sortHoldersBalanceDict(kncHoldersAboveMinBalance);

    console.log('number of KNC holders above min balance');
    console.log(Object.keys(kncHoldersAboveMinBalance).length);

    let daoReputation = {};
    let founders = [];

    let extraRepTrading = 0;
    let extraRepkyberTeam = 0;
    let extraRepfeeSharing = 0;
    let extraRepReserves = 0;
    let extraRepPrevPoll = 0;

    //build the reputation array.
    for(let holderAdd in kncHoldersAboveMinBalance) {
        // reputation for knc balance

        let rep = balanceToReputation(kncHoldersAboveMinBalance[holderAdd]);

        //extra reputation for trading.
        let tempRep = tradeVolumeToReputation(tradersVolumeEth[holderAdd]);
        if(tempRep > 0) {
            ++extraRepTrading;
            console.log("address: " + holderAdd + " trading extra rep: " + tempRep);
        }
        rep = rep * 1 + tempRep * 1;
        tempRep = 0;

        //extra reputation for kyber team
        if (kyberTeamAdds[holderAdd] == true) tempRep = 40;
        if(tempRep > 0) {
            ++extraRepkyberTeam;
            console.log("address: " + holderAdd + " kyber team extra rep: " + tempRep);
        }
        rep = rep * 1 + tempRep * 1;

        //extra reputation fee sharing wallets
        if (feeSharingWallets[holderAdd] == true) tempRep = 40;
        if(tempRep > 0) {
            ++extraRepfeeSharing;
            console.log("address: " + holderAdd + " fee share extra rep: " + tempRep);
        }
        rep = rep * 1 + tempRep * 1;

        //extra reputation for reserves
        if (reserveKncWalletsAdds[holderAdd] == true) tempRep = 40;
        if(tempRep > 0) {
            ++extraRepReserves;
            console.log("address: " + holderAdd + " reserve extra rep: " + tempRep);
        }
        rep = rep * 1 + tempRep * 1;

        //extra reputation for previous poll participants

        if (prevPollAdds[holderAdd] == true) tempRep = 30;
        if(tempRep > 0) {
            console.log("address: " + holderAdd + " prev poll extra rep: " + tempRep);
            ++extraRepPrevPoll;
        }
        rep = rep * 1 + tempRep * 1;

        daoReputation[holderAdd] = rep;

        let repRecord = {};
        repRecord['address'] = holderAdd;
        repRecord['tokens'] = 0
        repRecord['reputation'] = rep;

        founders.push(repRecord);
    }

    console.log("extra rep trading" + extraRepTrading)
    console.log("extra rep extraRepkyberTeam " + extraRepkyberTeam)
    console.log("extra rep extraRepfeeSharing " + extraRepfeeSharing)
    console.log("extra rep extraRepReserves " + extraRepReserves)
    console.log("extra rep extraRepPrevPoll " + extraRepPrevPoll)

    console.log("founders array ready. size: " + founders.length)
    //save results to file
    try {
        fs.writeFileSync(reputationScorePath, JSON.stringify(daoReputation, null, 2));
        fs.writeFileSync(daoFoundersPath, JSON.stringify(founders, null, 2));
        console.log("finished writing founders array to file: " + daoFoundersPath)
    } catch(e) {
        console.log(e);
    }
}

function balanceToReputation(balance) {
    if (balance > 100000) return 150;
    if (balance > 50000) return 120;
    if (balance > 20000) return 90;
    if (balance > 10000) return 70;
    if (balance > 5000) return 50;
    if (balance > 3000) return 30;
    return 10;
}

function tradeVolumeToReputation(volume) {
    if (volume > 120) return 40;
    if (volume > 80) return 30;
    if (volume > 50) return 20;
    if (volume > 20) return 10;
    return 0;
}

async function sortHoldersBalanceDict(holderBalanceDict) {

    let kncSortedBalance = {};

    try {
        let string = fs.readFileSync(sortedBalancesFileName);
        kncSortedBalance = JSON.parse(string);

        if(Object.keys(kncSortedBalance).length > 100) {
            return kncSortedBalance;
        }
    } catch(e) {
        console.log(e);
    }

    // Create items array
    kncSortedBalance = Object.keys(holderBalanceDict).map(function(key) {
        return [key, holderBalanceDict[key]];
    });

    // Sort the array based on the second element
    kncSortedBalance.sort(function(first, second) {
        return second[1] - first[1];
    });

    //save results to file
    try {
        fs.writeFileSync(sortedBalancesFileName, JSON.stringify(kncSortedBalance, null, 2));
    } catch(e) {
        console.log(e);
    }


    return kncSortedBalance;
}


async function getKncPotentialHolders() {
    const ERC20Abi = solcOutput.contracts["ERC20.sol:ERC20"].interface;
    const KNC = await new web3.eth.Contract(JSON.parse(ERC20Abi), kncTokenAddress);

    let fromBlockNum = KNCCreationBlock;
    let toBlockNum = fromBlockNum * 1 + numBlocksPerQuery * 1;
    let lastCheckedBlock = toBlockNum;
    let KNCPotentialHoldersDict = {};
    let holdersJson = {};

    try {
        holdersJson = JSON.parse(fs.readFileSync(holdersAddressFileName));

        fromBlockNum = holdersJson['lastCheckedBlock'];
        toBlockNum = fromBlockNum * 1 + numBlocksPerQuery * 1;
        if (toBlockNum > latest) toBlockNum = latest;
        KNCPotentialHoldersDict = holdersJson['potential holders'];
        totalTransferEvents = holdersJson['transfer events so far']
    } catch(e) {
        console.log(e);
    }

//    console.log("from block num " + fromBlockNum)
//    console.log("KNC balance block " + KNCBalanceBlockDec);
    if(fromBlockNum >= KNCBalanceBlockDec || fromBlockNum == 'latest') {
        console.log("last checked block: " + fromBlockNum)
        console.log("totalTransfer events: " + totalTransferEvents)
        return KNCPotentialHoldersDict;
    }

    while (true) {
        for (let j = 0; j < numQueriesPerRun; j++) {

            console.log("query events from block: " + fromBlockNum + " to block: " + toBlockNum);
            let KNCTransferEvents = await KNC.getPastEvents("Transfer", {fromBlock: fromBlockNum, toBlock: toBlockNum});

            totalTransferEvents = totalTransferEvents * 1 + KNCTransferEvents.length * 1;

            console.log("total transfer events " + totalTransferEvents + " added events: " + KNCTransferEvents.length);

            for(let i = 0; i < KNCTransferEvents.length; i++) {
               let address = KNCTransferEvents[i].returnValues.to;
               KNCPotentialHoldersDict[address] = true;
            };

            lastCheckedBlock = toBlockNum;
            if(toBlockNum == 'latest') break;

            fromBlockNum = toBlockNum
            toBlockNum = toBlockNum * 1 + numBlocksPerQuery * 1;
            if (toBlockNum > latest) toBlockNum = 'latest';
        }

        holdersJson['lastCheckedBlock'] = lastCheckedBlock;
        holdersJson['transfer events so far'] = totalTransferEvents;
        holdersJson['potential holders'] = KNCPotentialHoldersDict;

        console.log('KNCPotentialHoldersDict length');
        console.log(Object.keys(KNCPotentialHoldersDict).length);

        //save results to file
        try {
            let holdersString =  JSON.stringify(holdersJson, null, 2);
            fs.writeFileSync(holdersAddressFileName, JSON.stringify(holdersJson, null, 2));
        } catch(e) {
            console.log(e);
        }

        if(toBlockNum == 'latest') break;
    }

    console.log("total transfer events after alllllllllllllllllllllllllllll" + totalTransferEvents);
    return KNCPotentialHoldersDict;
}

async function getFeeSharingWallets() {
    const abi = solcOutput.contracts["FeeBurnerInterface.sol:FeeBurnerInterface"].interface;
    const feeBurner = await new web3.eth.Contract(JSON.parse(abi), feeBurnerAddress);

    let fromBlockNum = feeBurnerCreationBlock;
//    let toBlockNum = KNCBalanceBlockDec;
    let toBlockNum = fromBlockNum * 1 + 100000 * 1;

    let feeSharingWalletAddresses = {};

    try {
        feeSharingWalletAddresses = JSON.parse(fs.readFileSync(feeSharingWalletsFile));
        return feeSharingWalletAddresses;
    } catch(e) {
        console.log(e);
    }

//    console.log("from block num " + fromBlockNum)
//    console.log("KNC balance block " + KNCBalanceBlockDec);
    while(toBlockNum < KNCBalanceBlockDec) {
        console.log("query fee sharing events from: " + fromBlockNum + " to block: " + toBlockNum);
        let feeSharingEvents = await feeBurner.getPastEvents("AssignFeeToWallet", {fromBlock: fromBlockNum, toBlock: toBlockNum});

        for(let i = 0; i < feeSharingEvents.length; i++) {
            let address = feeSharingEvents[i].returnValues.wallet;

            feeSharingWalletAddresses[address] = true;
        };

        fromBlockNum = toBlockNum;
        toBlockNum = toBlockNum * 1 + numBlocksPerQuery * 1;
        if(toBlockNum > latest) toBlockNum = latest;
    }



    console.log('feeSharingWalletAddresses length');
    console.log(Object.keys(feeSharingWalletAddresses).length);
    console.log(feeSharingWalletAddresses)

    //save results to file
    try {
        let string =  JSON.stringify(feeSharingWalletAddresses, null, 2);
        fs.writeFileSync(feeSharingWalletsFile, string);
    } catch(e) {
        console.log(e);
    }

    return feeSharingWalletAddresses;
}

function getKyberTeamAddresses(){

    let kyberTeamAddresses;

    try {
        kyberTeamAddresses = JSON.parse(fs.readFileSync(kyberTeamFileName));
        return kyberTeamAddresses;
    } catch(e) {
        console.log(e);
    }
}


function getPreviousPollAddresses(){
    let prevPollAddresses;

    try {
        prevPollAddresses = JSON.parse(fs.readFileSync(prevPollFileName));
        return prevPollAddresses;
    } catch(e) {
        console.log(e);
    }
}

async function getReserveKNCwalletAddresses() {
    const abi = solcOutput.contracts["FeeBurnerInterface.sol:FeeBurnerInterface"].interface;

    const feeBurner = await new web3.eth.Contract(JSON.parse(abi), feeBurnerAddress);

    let fromBlockNum = feeBurnerCreationBlock;
    let toBlockNum = KNCBalanceBlockDec;
//    let toBlockNum = fromBlockNum * 1 + 100000 * 1;

    let reserveKNCWalletAddress = {};

    try {
        reserveKNCWalletAddress = JSON.parse(fs.readFileSync(reservesKncWalletsFile));
        return reserveKNCWalletAddress;
    } catch(e) {
        console.log(e);
    }

//    console.log("from block num " + fromBlockNum)
//    console.log("KNC balance block " + KNCBalanceBlockDec);
//    while(toBlockNum < KNCBalanceBlockDec) {
        console.log("query fee reserve knc wallets events from: " + fromBlockNum + " to block: " + toBlockNum);
        let reserveDataSetEvent = await feeBurner.getPastEvents("ReserveDataSet", {fromBlock: fromBlockNum, toBlock: toBlockNum});

        console.log("reserveDataSetEvent.length " + reserveDataSetEvent.length)
        for(let i = 0; i < reserveDataSetEvent.length; i++) {
            let reserve = reserveDataSetEvent[i].returnValues.reserve;
            let kncWallet = reserveDataSetEvent[i].returnValues.kncWallet;

            if(reserve != kncWallet) {
                reserveKNCWalletAddress[kncWallet] = true;
            }
        };
//        break;
//
//        fromBlockNum = toBlockNum;
//        toBlockNum = toBlockNum * 1 + numBlocksPerQuery * 1;
//        if(toBlockNum > latest) toBlockNum = 'latest';
//    }

    console.log('reserveKNCWalletAddress length');
    console.log(Object.keys(reserveKNCWalletAddress).length);
    console.log(reserveKNCWalletAddress)

    //save results to file
    try {
        let string =  JSON.stringify(reserveKNCWalletAddress, null, 2);
        fs.writeFileSync(reservesKncWalletsFile, string);
    } catch(e) {
        console.log(e);
    }

    return reserveKNCWalletAddress;
}

async function readTradersCSV() {
    const input = fs.readFileSync(tradersFilePath);
    console.log("done reading file")

    const tradersRecords = syncParse(input, {
        columns: true,
        skip_empty_lines: true,
        quote: '"',
        delimiter: ";",
        recordDelimiter: "\r\n"
        }
    )
    let tradersVolumeEth = {};

    console.log("num traders records: " + tradersRecords.length)
    for(let i = 0; i < tradersRecords.length; i++) {
        if(tradersRecords[i]['sum'] > minTradeVolumeEth) {
            let address = (tradersRecords[i]['user_addr']).toLowerCase();
            tradersVolumeEth[address] = tradersRecords[i]['sum'];
        }
    }

    return tradersVolumeEth;
}

async function getKncHoldersAboveMinBal(holdersDict, kncBalanceWaterMark) {

    let kncBalanceDict = {};

    try {
        let string = fs.readFileSync(balancesFileName);
        kncBalanceDict = JSON.parse(string);

        if(Object.keys(kncBalanceDict).length > 4000) {
            return kncBalanceDict;
        }
    } catch(e) {
        console.log(e);
    }

    const web3Bal = new Web3(new Web3.providers.HttpProvider(mainnetUrls[0]), null, {defaultBlock: KNCBalanceBlock});
//    const web3Bal = web3

    const queryBalBlock = await web3Bal.eth.defaultBlock;
    console.log("query balance block: " + queryBalBlock);

    const GetBalanceAbi = solcOutput.contracts["GetBalance.sol:GetBalance"].interface;
    const GetBalance = await new web3Bal.eth.Contract(JSON.parse(GetBalanceAbi), '0x60D35F05A18f5817215ac1d3Fa719a3Cb7372d0F');

    console.log('KNCPotentialHoldersDict length');
    console.log(Object.keys(holdersDict).length);

    const holdersPerArray = 350;
    //get balance for all potential holders
    /////////////////////////////
    let holdersPartialArray = [];
    let numAddedToPartial = 0;
    let balancesQueriedSoFar = 0;
    let totalKNCHolders = 0;

//    const debugAdd = '0x6134f697568592392a5AeacaEa8b01fa9E2114bE';

    const holdersDictLen = Object.keys(holdersDict).length;
    let totalQueriedAddresses = 0;

    for(let holderAdd in holdersDict) {
        holdersPartialArray.push(holderAdd.toLowerCase());
        ++totalQueriedAddresses; // counter for all queries

        if(++numAddedToPartial < holdersPerArray) {
            if (totalQueriedAddresses < holdersDictLen) continue;
        }

        let balances = await GetBalance.methods.getKncBalance(holdersPartialArray).call();

        for (let count = 0; count < balances.length; ++count) {
            let weiBalance = web3.utils.toBN(balances[count]);

            if (weiBalance > 0) {
                ++totalKNCHolders;
            }

            let tokenBalance = (weiBalance.div(web3.utils.toBN(10 ** 17))) / 10;

            if (tokenBalance > kncBalanceWaterMark  ) {
                kncBalanceDict[holdersPartialArray[count]] = tokenBalance.toString();
            }
        }

        balancesQueriedSoFar = balancesQueriedSoFar * 1 + numAddedToPartial * 1;
        console.log("total KNC holders number: " + totalKNCHolders);
        console.log("balance queries so far: " + balancesQueriedSoFar)
        console.log("num KNC holders > " + balanceWaterMark + " is: " + Object.keys(kncBalanceDict).length);

        holdersPartialArray = [];
        numAddedToPartial = 0;
    }

    //save results to file
    try {
        fs.writeFileSync(balancesFileName, JSON.stringify(kncBalanceDict, null, 2));
    } catch(e) {
        console.log(e);
    }

    console.log("total KNC holders number: " + totalKNCHolders);
    console.log("balance queries so far: " + balancesQueriedSoFar)
    console.log("num KNC holders > " + balanceWaterMark + " is: " + Object.keys(kncBalanceDict).length);

    return kncBalanceDict;
}

function myLog(error, highlight, string) {
    if (error) {
//        console.error(string);
        console.log('\x1b[31m%s\x1b[0m', string);
    } else if (highlight) {
        console.log('\x1b[33m%s\x1b[0m', string);
    } else {
        console.log('\x1b[32m%s\x1b[0m', string);
    }
};

async function connectToChain() {

    let isListening;
    try {
        isListening = await web3.eth.net.isListening();
    } catch (e) {
        myLog(1, 0, ("can't connect to node: " + nodeURL + ". check your internet connection. Or possibly check status of this node."));
        myLog(0, 0, ("exception: " + e));
        throw(e);
    }

    numPeers = await web3.eth.net.getPeerCount();
    myLog(0, 1, ( "node " + nodeURL + " listening: " + isListening.toString() + " with " + numPeers + " peers"));
}

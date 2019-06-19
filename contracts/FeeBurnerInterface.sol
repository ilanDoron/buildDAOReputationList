pragma solidity ^0.4.18;


interface FeeBurnerInterface {
    event ReserveDataSet(address reserve, uint feeInBps, address kncWallet);
    event AssignFeeToWallet(address reserve, address wallet, uint walletFee);

}

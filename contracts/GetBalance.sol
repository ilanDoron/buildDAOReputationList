pragma solidity ^0.4.18;


import "./ERC20.sol";


contract GetBalance {

    ERC20 public constant KNC = ERC20(0xdd974D5C2e2928deA5F71b9825b8b646686BD200);

    function getTokenBalance(ERC20 token, address[] holders) public view returns (uint[] memory) {

        uint [] memory resBalances = new uint[](holders.length);

        for (uint i = 0; i < holders.length; ++i) {
            resBalances[i] = token.balanceOf(holders[i]);
        }

        return resBalances;
    }

    function getKncBalance(address[] holders) external view returns (uint[] memory) {
        return getTokenBalance(KNC, holders);
    }
}


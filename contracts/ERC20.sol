pragma solidity ^0.4.18;


interface ERC20 {
    function totalSupply() external view returns (uint supply);
    function balanceOf(address _owner) external view returns (uint balance);
    function transfer(address _to, uint _value) external returns (bool success);
    function transferFrom(address _from, address _to, uint _value) external returns (bool success);
    function approve(address _spender, uint _value) external returns (bool success);
    function allowance(address _owner, address _spender) external view returns (uint remaining);
    function decimals() external view returns(uint digits);
    function name() external view returns(string tokenName);
    function symbol() external view returns(string tokenSymbol);

    event Transfer(address indexed from, address indexed to, uint tokens);
    event Approval(address indexed _owner, address indexed _spender, uint _value);
}


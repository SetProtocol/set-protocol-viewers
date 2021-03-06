const snapshotAddresses = {
  'CommonValidationsLibrary': '0x2C530e4Ecc573F11bd72CF5Fdf580d134d25f15F',
  'ERC20Wrapper': '0x72D5A2213bfE46dF9FbDa08E22f536aC6Ca8907e',
  'CoreIssuanceLibrary': '0x2eBb94Cc79D7D0F1195300aAf191d118F53292a8',
  'ExchangeIssuanceLibrary': '0x5315e44798395d4a952530d131249fE00f554565',
  'RebalancingLibrary': '0xDFF540fE764855D3175DcfAe9d91AE8aEE5C6D6F',
  'SetTokenLibrary': '0xC1bE2c0bb387aa13d5019a9c518E8BC93cb53360',
  'ProposeLibrary': '0xda54ecF5A234D6CD85Ce93A955860834aCA75878',
  'SettleRebalanceLibrary': '0x33DeF1aA867Be09809F3a01CE41d5eC1888846c9',
  'StartRebalanceLibrary': '0x10A736A7b223f1FE1050264249d1aBb975741E75',
  'PlaceBidLibrary': '0xb125995F5a4766C451cD8C34C4F5CAC89b724571',
  'FailAuctionLibrary': '0xc7124963Ab16C33E5bF421D4c0090116622B3074',
  'WBTC': '0xC6B0D3C45A6b5092808196cB00dF5C357d55E1d5',
  'WETH': '0x7209185959D7227FB77274e1e88151D7C4c368D3',
  'DAI': '0x3f16cA81691dAB9184cb4606C361D73c4FD2510a',
  'WBTC_MEDIANIZER': '0x45B3A72221E571017C0f0ec42189E11d149D0ACE',
  'WETH_MEDIANIZER': '0x4ef5b1E3dA5573466Fb1724D2Fca95290119B664',
  'Vault': '0x404C55a936f3006B13B020efAaf5771A600Ec04d',
  'TransferProxy': '0xfD946D47d3dB1e06126d16281Fb3E222A1bA8179',
  'Core': '0x96EccEa4E124322a6aA0a004da1b91d9a3024C73',
  'SetTokenFactory': '0xDDb2B738682AD218eD87CF6f3a466798644e5d8D',
  'WhiteList': '0xd2aa8d362b1CaA68553642831b86Abb3D24B4579',
  'RebalancingSetTokenFactory': '0x434f1EB003B78c0EAbe034313F1aFf47920e0860',
  'RebalancingSetTokenFactory-2': '0x16C057c0494A0d7FB83974356Ce44323793BcFb2',
  'ExchangeIssuanceModule': '0x46c6A737C75cE3a58c6b2De14970E8841c72DcEF',
  'RebalanceAuctionModule': '0x1a488d7B42C1Ec1539b78f772BF13eCCB723f5fa',
  'KyberNetworkWrapper': '0x965D352283a3C8A016b9BBbC9bf6306665d495E7',
  'ZeroExExchangeWrapper': '0x9a1df498af690a7EB43E10A28AB51345a3A33F75',
  'LinearAuctionPriceCurve': '0xBDFcAAd0072d2976C9Eaee1a5c36BECC888738c8',
  'RebalancingSetExchangeIssuanceModule': '0xe092f6C9fDC20D23207E96A9845E0989ab94385c',
};

export const getDeployedAddress = contractName => {
  return snapshotAddresses[contractName];
};

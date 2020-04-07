import { BigNumber } from 'bignumber.js';
import { Address } from 'set-protocol-utils';
import Web3 from 'web3';
import {
  CTokenViewerContract,
  ERC20ViewerContract,
  ManagerViewerContract,
  TrendingManagerMockContract,
  ProtocolViewerContract,
  RebalancingSetTokenViewerContract,
  SocialTradingManagerMockContract,
  TradingPoolViewerContract,
} from '../contracts';
import { getContractInstance, txnFrom } from '../web3Helper';
import {
  ONE_DAY_IN_SECONDS,
  DEFAULT_GAS,
} from '../constants';
import { RebalancingSetTokenV3FactoryContract } from 'set-protocol-contracts';

const RebalancingSetTokenV3Factory =
  require(
    'set-protocol-contracts/dist/artifacts/ts/RebalancingSetTokenV3Factory'
  ).RebalancingSetTokenV3Factory;
const FactoryUtilsLibrary =
  require('set-protocol-contracts/dist/artifacts/ts/FactoryUtilsLibrary').FactoryUtilsLibrary;
const Bytes32Library =
  require('set-protocol-contracts/dist/artifacts/ts/Bytes32Library').Bytes32Library;


const CTokenViewer = artifacts.require('CTokenViewer');
const ERC20Viewer = artifacts.require('ERC20Viewer');
const ManagerViewer = artifacts.require('ManagerViewer');
const TrendingManagerMock = artifacts.require('TrendingManagerMock');
const ProtocolViewer = artifacts.require('ProtocolViewer');
const RebalancingSetTokenViewer = artifacts.require('RebalancingSetTokenViewer');
const SocialTradingManagerMock = artifacts.require('SocialTradingManagerMock');
const TradingPoolViewer = artifacts.require('TradingPoolViewer');

const contract = require('truffle-contract');

export class ProtocolViewerHelper {
  private _contractOwnerAddress: Address;

  constructor(contractOwnerAddress: Address) {
    this._contractOwnerAddress = contractOwnerAddress;
  }

  /* ============ Deployment ============ */

  public async deployCTokenViewerAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<CTokenViewerContract> {
    const
    cTokenViewer = await CTokenViewer.new(
      txnFrom(from)
    );

    return new CTokenViewerContract(
      getContractInstance(cTokenViewer),
      txnFrom(from),
    );
  }

  public async deployERC20ViewerContract(
    from: Address = this._contractOwnerAddress
  ): Promise<ERC20ViewerContract> {
    const erc20ViewerContract = await ERC20Viewer.new(txnFrom(from));

    return new ERC20ViewerContract(
      getContractInstance(erc20ViewerContract),
      txnFrom(from),
    );
  }

  public async deployManagerViewerAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<ManagerViewerContract> {
    const
    managerViewer = await ManagerViewer.new(
      txnFrom(from)
    );

    return new ManagerViewerContract(
      getContractInstance(managerViewer),
      txnFrom(from),
    );
  }

  public async deployProtocolViewerAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<ProtocolViewerContract> {
    const protocolViewerContract = await ProtocolViewer.new(txnFrom(from));

    return new ProtocolViewerContract(
      getContractInstance(protocolViewerContract),
      txnFrom(from),
    );
  }

  public async deployRebalancingSetTokenViewerAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<RebalancingSetTokenViewerContract> {
    const rebalancingSetTokenViewer = await RebalancingSetTokenViewer.new(txnFrom(from));

    return new RebalancingSetTokenViewerContract(
      getContractInstance(rebalancingSetTokenViewer),
      txnFrom(from),
    );
  }

  public async deployTradingPoolViewerAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<TradingPoolViewerContract> {
    const
    tradingPoolViewer = await TradingPoolViewer.new(
      txnFrom(from)
    );

    return new TradingPoolViewerContract(
      getContractInstance(tradingPoolViewer),
      txnFrom(from),
    );
  }

  public async deploySocialTradingManagerMockAsync(
    from: Address = this._contractOwnerAddress
  ): Promise<SocialTradingManagerMockContract> {
    const
    socialManager = await SocialTradingManagerMock.new(
      txnFrom(from)
    );

    return new SocialTradingManagerMockContract(
      getContractInstance(socialManager),
      txnFrom(from),
    );
  }

  public async deployTrendingManagerMockAsync(
    crossoverTimestamp: BigNumber,
    from: Address = this._contractOwnerAddress
  ): Promise<TrendingManagerMockContract> {
    const trendingManagerMock = await TrendingManagerMock.new(
      crossoverTimestamp,
      txnFrom(from)
    );

    return new TrendingManagerMockContract(
      getContractInstance(trendingManagerMock),
      txnFrom(from),
    );
  }

  public async deployRebalancingSetTokenV3FactoryAsync(
    coreAddress: Address,
    componentWhitelistAddress: Address,
    liquidatorWhitelistAddress: Address,
    feeCalculatorWhitelistAddress: Address,
    minimumRebalanceInterval: BigNumber = ONE_DAY_IN_SECONDS,
    minimumFailRebalancePeriod: BigNumber = ONE_DAY_IN_SECONDS,
    maximumFailRebalancePeriod: BigNumber = ONE_DAY_IN_SECONDS.mul(30),
    minimumNaturalUnit: BigNumber = new BigNumber(10),
    maximumNaturalUnit: BigNumber = new BigNumber(10 ** 14),
    from: Address = this._contractOwnerAddress
  ): Promise<RebalancingSetTokenV3FactoryContract> {
    const truffleBytes32LibraryContract = this.setDefaultTruffleContract(web3, Bytes32Library);
    const deployedBytes32LibraryContract = await truffleBytes32LibraryContract.new();

    const truffleFactoryUtilsLibContract = this.setDefaultTruffleContract(web3, FactoryUtilsLibrary);
    const deployedFactoryUtilsLibContract = await truffleFactoryUtilsLibContract.new();

    const truffleTokenFactory = this.setDefaultTruffleContract(web3, RebalancingSetTokenV3Factory);

    await truffleTokenFactory.link(
      'Bytes32Library',
      deployedBytes32LibraryContract.address
    );

    await truffleTokenFactory.link(
      'FactoryUtilsLibrary',
      deployedFactoryUtilsLibContract.address
    );

    const deployedTokenFactory = await truffleTokenFactory.new(
      coreAddress,
      componentWhitelistAddress,
      liquidatorWhitelistAddress,
      feeCalculatorWhitelistAddress,
      minimumRebalanceInterval,
      minimumFailRebalancePeriod,
      maximumFailRebalancePeriod,
      minimumNaturalUnit,
      maximumNaturalUnit,
      { from },
    );

    return await RebalancingSetTokenV3FactoryContract.at(
      deployedTokenFactory.address,
      web3,
      { from, gas: DEFAULT_GAS },
    );
  }

  private setDefaultTruffleContract(web3: Web3, contractInstance: any): any {
    const TX_DEFAULTS = {
      from: this._contractOwnerAddress,
      gasPrice: 6000000000,
      gas: 6712390,
    };
    const truffleContract = contract(contractInstance);
    truffleContract.setProvider(web3.currentProvider);
    truffleContract.setNetwork(50);
    truffleContract.defaults(TX_DEFAULTS);

    return truffleContract;
  }
}

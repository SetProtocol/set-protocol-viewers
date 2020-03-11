import { BigNumber } from 'bignumber.js';
import { Address } from 'set-protocol-utils';
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

const CTokenViewer = artifacts.require('CTokenViewer');
const ERC20Viewer = artifacts.require('ERC20Viewer');
const ManagerViewer = artifacts.require('ManagerViewer');
const TrendingManagerMock = artifacts.require('TrendingManagerMock');
const ProtocolViewer = artifacts.require('ProtocolViewer');
const RebalancingSetTokenViewer = artifacts.require('RebalancingSetTokenViewer');
const SocialTradingManagerMock = artifacts.require('SocialTradingManagerMock');
const TradingPoolViewer = artifacts.require('TradingPoolViewer');


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
}
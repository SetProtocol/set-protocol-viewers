require('module-alias/register');

import * as ABIDecoder from 'abi-decoder';
import * as chai from 'chai';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  ConstantAuctionPriceCurveContract,
  CoreMockContract,
  RebalancingSetTokenContract,
  RebalancingSetTokenFactoryContract,
  SetTokenContract,
  SetTokenFactoryContract,
  StandardTokenMockContract,
  TransferProxyContract,
  VaultContract,
  WhiteListContract,
} from 'set-protocol-contracts';
import {
  ERC20ViewerContract,
} from '@utils/contracts';
import { ether } from '@utils/units';
import {
  ONE_DAY_IN_SECONDS,
  DEFAULT_AUCTION_PRICE_NUMERATOR,
  DEFAULT_AUCTION_PRICE_DIVISOR,
} from '@utils/constants';
import { expectRevertError } from '@utils/tokenAssertions';

import {
  Blockchain,
  CoreHelper,
  ERC20Helper,
  RebalancingHelper,
} from 'set-protocol-contracts';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';

const CoreMock =
  require('set-protocol-contracts/dist/artifacts/ts/CoreMock').CoreMock;

BigNumberSetup.configure();
ChaiSetup.configure();
const blockchain = new Blockchain(web3);
const { expect } = chai;


contract('ERC20Viewer', accounts => {
  const [
    deployerAccount,
    managerAccount,
    ownerAccount,
    anotherAccount,
  ] = accounts;

  let coreMock: CoreMockContract;
  let transferProxy: TransferProxyContract;
  let vault: VaultContract;
  let factory: SetTokenFactoryContract;
  let rebalancingComponentWhiteList: WhiteListContract;
  let rebalancingFactory: RebalancingSetTokenFactoryContract;
  let constantAuctionPriceCurve: ConstantAuctionPriceCurveContract;

  const coreHelper = new CoreHelper(deployerAccount, deployerAccount);
  const erc20Helper = new ERC20Helper(deployerAccount);
  const protocolViewerHelper = new ProtocolViewerHelper(deployerAccount);
  const rebalancingHelper = new RebalancingHelper(
    deployerAccount,
    coreHelper,
    erc20Helper,
    blockchain
  );

  let token: StandardTokenMockContract;
  let currentSetToken: SetTokenContract;
  let rebalancingSetToken: RebalancingSetTokenContract;

  let erc20Viewer: ERC20ViewerContract;

  before(async () => {
    ABIDecoder.addABI(CoreMock.abi);
  });

  after(async () => {
    ABIDecoder.removeABI(CoreMock.abi);
  });

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    transferProxy = await coreHelper.deployTransferProxyAsync();
    vault = await coreHelper.deployVaultAsync();
    coreMock = await coreHelper.deployCoreMockAsync(transferProxy, vault);

    factory = await coreHelper.deploySetTokenFactoryAsync(coreMock.address);
    rebalancingComponentWhiteList = await coreHelper.deployWhiteListAsync();
    rebalancingFactory = await coreHelper.deployRebalancingSetTokenFactoryAsync(
      coreMock.address,
      rebalancingComponentWhiteList.address,
    );
    constantAuctionPriceCurve = await rebalancingHelper.deployConstantAuctionPriceCurveAsync(
      DEFAULT_AUCTION_PRICE_NUMERATOR,
      DEFAULT_AUCTION_PRICE_DIVISOR,
    );

    await coreHelper.setDefaultStateAndAuthorizationsAsync(coreMock, vault, transferProxy, factory);
    await coreHelper.addFactoryAsync(coreMock, rebalancingFactory);
    await rebalancingHelper.addPriceLibraryAsync(coreMock, constantAuctionPriceCurve);

    erc20Viewer = await protocolViewerHelper.deployProtocolViewerAsync();

    token = await erc20Helper.deployTokenAsync(ownerAccount);
    const naturalUnits = [ether(.001), ether(.0001)];

    const setTokens = await rebalancingHelper.createSetTokensAsync(
      coreMock,
      factory.address,
      transferProxy.address,
      2,
      naturalUnits
    );

    currentSetToken = setTokens[0];

    rebalancingSetToken = await rebalancingHelper.createDefaultRebalancingSetTokenAsync(
      coreMock,
      rebalancingFactory.address,
      managerAccount,
      currentSetToken.address,
      ONE_DAY_IN_SECONDS
    );

    // Issue currentSetToken
    await coreMock.issue.sendTransactionAsync(currentSetToken.address, ether(8), {from: deployerAccount});
    await erc20Helper.approveTransfersAsync([currentSetToken], transferProxy.address);

    // Use issued currentSetToken to issue rebalancingSetToken
    const rebalancingSetTokenQuantityToIssue = ether(8);
    await coreMock.issue.sendTransactionAsync(rebalancingSetToken.address, rebalancingSetTokenQuantityToIssue);
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  describe('#batchFetchSupplies', async () => {
    let subjectTokenAddresses: Address[];

    beforeEach(async () => {
      subjectTokenAddresses = [token.address, currentSetToken.address, rebalancingSetToken.address];
    });

    async function subject(): Promise<BigNumber[]> {
      return erc20Viewer.batchFetchSupplies.callAsync(
        subjectTokenAddresses,
      );
    }

    it('fetches the supplies of the token addresses', async () => {
      const supplies: BigNumber[] = await subject();
      const suppliesJSON = JSON.stringify(supplies);

      const expectedSupplies = await erc20Helper.getTokenSupplies([token, currentSetToken, rebalancingSetToken]);
      const expectedSuppliesJSON = JSON.stringify(expectedSupplies);

      expect(suppliesJSON).to.equal(expectedSuppliesJSON);
    });

    describe('when the token addresses includes a non ERC20 contract', async () => {
      beforeEach(async () => {
        subjectTokenAddresses = [ownerAccount];
      });

      it('should revert', async () => {
        await expectRevertError(subject());
      });
    });
  });

  describe('#batchFetchBalancesOf', async () => {
    let subjectTokenAddresses: Address[];
    let subjectTokenOwner: Address;

    beforeEach(async () => {
      token = await erc20Helper.deployTokenAsync(ownerAccount);

      subjectTokenAddresses = [token.address, currentSetToken.address, rebalancingSetToken.address];
      subjectTokenOwner = deployerAccount;
    });

    async function subject(): Promise<BigNumber[]> {
      return erc20Viewer.batchFetchBalancesOf.callAsync(
        subjectTokenAddresses,
        subjectTokenOwner,
      );
    }

    it('fetches the balances of the token addresses', async () => {
      const balances: BigNumber[] = await subject();
      const balancesJSON = JSON.stringify(balances);

      const expectedBalances = await erc20Helper.getTokenBalances(
        [token, currentSetToken, rebalancingSetToken],
        subjectTokenOwner
      );
      const expectedBalancesJSON = JSON.stringify(expectedBalances);

      expect(balancesJSON).to.equal(expectedBalancesJSON);
    });

    describe('when the token addresses includes a non ERC20 contract', async () => {
      beforeEach(async () => {
        subjectTokenAddresses = [ownerAccount];
      });

      it('should revert', async () => {
        await expectRevertError(subject());
      });
    });
  });

  describe('#batchFetchUsersBalances', async () => {
    let subjectTokenAddresses: Address[];
    let subjectTokenOwners: Address[];

    beforeEach(async () => {
      token = await erc20Helper.deployTokenAsync(ownerAccount);

      subjectTokenAddresses = [token.address, currentSetToken.address, rebalancingSetToken.address];
      subjectTokenOwners = [deployerAccount, anotherAccount, deployerAccount];
    });

    async function subject(): Promise<BigNumber[]> {
      return erc20Viewer.batchFetchUsersBalances.callAsync(
        subjectTokenAddresses,
        subjectTokenOwners,
      );
    }

    it('fetches the balances of the token addresses', async () => {
      const balances: BigNumber[] = await subject();
      const balancesJSON = JSON.stringify(balances);

      const expectedDeployerBalances = await erc20Helper.getTokenBalances(
        [token, rebalancingSetToken],
        deployerAccount
      );
      const expectedAnotherAccountBalances = await erc20Helper.getTokenBalances(
        [currentSetToken],
        anotherAccount
      );
      const expectedBalances = [
        expectedDeployerBalances[0],
        expectedAnotherAccountBalances[0],
        expectedDeployerBalances[1],
      ];
      const expectedBalancesJSON = JSON.stringify(expectedBalances);
      expect(balancesJSON).to.equal(expectedBalancesJSON);
    });
  });
});

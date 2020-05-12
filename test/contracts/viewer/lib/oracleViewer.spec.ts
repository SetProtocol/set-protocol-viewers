require('module-alias/register');

import * as chai from 'chai';
import { Address } from 'set-protocol-utils';
import { BigNumber } from 'bignumber.js';

import ChaiSetup from '@utils/chaiSetup';
import { BigNumberSetup } from '@utils/bigNumberSetup';
import {
  OracleViewerContract,
} from '@utils/contracts';

import {
  Blockchain
} from 'set-protocol-contracts';
import {
  OracleHelper,
  UpdatableOracleMockContract
} from 'set-protocol-oracles';
import { ProtocolViewerHelper } from '@utils/helpers/protocolViewerHelper';
import { ether } from '@utils/units';

BigNumberSetup.configure();
ChaiSetup.configure();
const { expect } = chai;
const blockchain = new Blockchain(web3);

contract('OracleViewer', accounts => {
  const [
    deployerAccount,
  ] = accounts;

  let wrappedETHOracle: UpdatableOracleMockContract;
  let wrappedBTCOracle: UpdatableOracleMockContract;
  let usdcOracle: UpdatableOracleMockContract;
  let daiOracle: UpdatableOracleMockContract;

  let wrappedETHPrice: BigNumber;
  let wrappedBTCPrice: BigNumber;
  let usdcPrice: BigNumber;
  let daiPrice: BigNumber;


  const oracleHelper = new OracleHelper(deployerAccount);
  const protocolViewerHelper = new ProtocolViewerHelper(deployerAccount);

  let oracleViewer: OracleViewerContract;

  beforeEach(async () => {
    await blockchain.saveSnapshotAsync();

    wrappedETHPrice = ether(128);
    wrappedBTCPrice = ether(7500);
    usdcPrice = ether(1);
    daiPrice = ether(1);

    wrappedETHOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedETHPrice);
    wrappedBTCOracle = await oracleHelper.deployUpdatableOracleMockAsync(wrappedBTCPrice);
    usdcOracle = await oracleHelper.deployUpdatableOracleMockAsync(usdcPrice);
    daiOracle = await oracleHelper.deployUpdatableOracleMockAsync(daiPrice);

    oracleViewer = await protocolViewerHelper.deployOracleViewerAsync();
  });

  afterEach(async () => {
    await blockchain.revertAsync();
  });

  describe('#batchFetchOraclePrices', async () => {
    let subjectOracleAddresses: Address[];

    beforeEach(async () => {
      subjectOracleAddresses = [
        wrappedETHOracle.address,
        wrappedBTCOracle.address,
        usdcOracle.address,
        daiOracle.address,
      ];
    });

    async function subject(): Promise<any> {
      return oracleViewer.batchFetchOraclePrices.callAsync(
        subjectOracleAddresses,
      );
    }

    it('fetches oracle prices', async () => {
      const oraclePrices = await subject();

      const expectedOraclePrices = [wrappedETHPrice, wrappedBTCPrice, usdcPrice, daiPrice];
      expect(JSON.stringify(oraclePrices)).to.equal(JSON.stringify(expectedOraclePrices));
    });
  });
});
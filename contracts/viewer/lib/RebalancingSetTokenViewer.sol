/*
    Copyright 2019 Set Labs Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
*/

pragma solidity 0.5.7;
pragma experimental "ABIEncoderV2";

import { ERC20Detailed } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Detailed.sol";

import { ILiquidator } from "set-protocol-contracts/contracts/core/interfaces/ILiquidator.sol";
import { IPerformanceFeeCalculator } from "set-protocol-contracts/contracts/core/interfaces/IPerformanceFeeCalculator.sol";
import { IRebalancingSetToken } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetToken.sol";
import { IRebalancingSetTokenV2 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV2.sol";
import { IRebalancingSetTokenV3 } from "set-protocol-contracts/contracts/core/interfaces/IRebalancingSetTokenV3.sol";
import { ISetToken } from "set-protocol-contracts/contracts/core/interfaces/ISetToken.sol";
import { ITWAPAuctionGetters } from "set-protocol-contracts/contracts/core/interfaces/ITWAPAuctionGetters.sol";
import { PerformanceFeeLibrary } from "set-protocol-contracts/contracts/core/fee-calculators/lib/PerformanceFeeLibrary.sol";
import { RebalancingLibrary } from "set-protocol-contracts/contracts/core/lib/RebalancingLibrary.sol";


/**
 * @title RebalancingSetTokenViewer
 * @author Set Protocol
 *
 * Interfaces for fetching multiple RebalancingSetToken state in a single read
 */
contract RebalancingSetTokenViewer {

    struct CollateralAndState {
        address collateralSet;
        RebalancingLibrary.State state;
    }

    struct CollateralSetInfo {
        address[] components;
        uint256[] units;
        uint256 naturalUnit;
        string name;
        string symbol;
    }

    struct RebalancingSetRebalanceInfo {
        uint256 rebalanceStartTime;
        uint256 timeToPivot;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startingCurrentSets;
        uint256 remainingCurrentSets;
        uint256 minimumBid;
        RebalancingLibrary.State rebalanceState;
        ISetToken nextSet;
        ILiquidator liquidator;
    }

    struct RebalancingSetCreateInfo {
        address manager;
        address feeRecipient;
        ISetToken currentSet;
        ILiquidator liquidator;
        uint256 unitShares;
        uint256 naturalUnit;
        uint256 rebalanceInterval;
        uint256 entryFee;
        uint256 rebalanceFee;
        uint256 lastRebalanceTimestamp;
        RebalancingLibrary.State rebalanceState;
        string name;
        string symbol;
    }

    struct TWAPRebalanceInfo {
        uint256 rebalanceStartTime;
        uint256 timeToPivot;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startingCurrentSets;
        uint256 remainingCurrentSets;
        uint256 minimumBid;
        RebalancingLibrary.State rebalanceState;
        ISetToken nextSet;
        ILiquidator liquidator;
        uint256 orderSize;
        uint256 orderRemaining;
        uint256 totalSetsRemaining;
        uint256 chunkSize;
        uint256 chunkAuctionPeriod;
        uint256 lastChunkAuctionEnd;
    }

    /* ============ RebalancingSetV1 Functions ============ */

    /*
     * Fetches all RebalancingSetToken state associated with a rebalance proposal
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return address[]                      Auction proposal library and next allocation SetToken addresses
     * @return uint256[]                      Auction time to pivot, start price, and pivot price
     */
    function fetchRebalanceProposalStateAsync(
        IRebalancingSetToken _rebalancingSetToken
    )
        external
        returns (RebalancingLibrary.State, address[] memory, uint256[] memory)
    {
        // Fetch the RebalancingSetToken's current rebalance state
        RebalancingLibrary.State rebalanceState = _rebalancingSetToken.rebalanceState();

        // Create return address arrays
        address[] memory auctionAddressParams = new address[](2);
        // Fetch the addresses associated with the current rebalance
        auctionAddressParams[0] = _rebalancingSetToken.nextSet();
        auctionAddressParams[1] = _rebalancingSetToken.auctionLibrary();
        
        // Create return integer array
        uint256[] memory auctionIntegerParams = new uint256[](4);
        auctionIntegerParams[0] = _rebalancingSetToken.proposalStartTime();

        // Fetch the current rebalance's proposal parameters
        uint256[] memory auctionParameters = _rebalancingSetToken.getAuctionPriceParameters();
        auctionIntegerParams[1] = auctionParameters[1]; // auctionTimeToPivot
        auctionIntegerParams[2] = auctionParameters[2]; // auctionStartPrice
        auctionIntegerParams[3] = auctionParameters[3]; // auctionPivotPrice

        return (rebalanceState, auctionAddressParams, auctionIntegerParams);
    }

    /*
     * Fetches all RebalancingSetToken state associated with a new rebalance auction
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchRebalanceAuctionStateAsync(
        IRebalancingSetToken _rebalancingSetToken
    )
        external
        returns (RebalancingLibrary.State, uint256[] memory)
    {
        // Fetch the RebalancingSetToken's current rebalance state
        RebalancingLibrary.State rebalanceState = _rebalancingSetToken.rebalanceState();

        // Fetch the current rebalance's startingCurrentSetAmount
        uint256[] memory auctionIntegerParams = new uint256[](4);
        auctionIntegerParams[0] = _rebalancingSetToken.startingCurrentSetAmount();

        // Fetch the current rebalance's auction parameters which are made up of various auction times and prices
        uint256[] memory auctionParameters = _rebalancingSetToken.getAuctionPriceParameters();
        auctionIntegerParams[1] = auctionParameters[0]; // auctionStartTime

        // Fetch the current rebalance's bidding parameters which includes the minimum bid and the remaining shares
        uint256[] memory biddingParameters = _rebalancingSetToken.getBiddingParameters();
        auctionIntegerParams[2] = biddingParameters[0]; // minimumBid
        auctionIntegerParams[3] = biddingParameters[1]; // remainingCurrentSets

        return (rebalanceState, auctionIntegerParams);
    }

    /* ============ Event Based Fetching Functions ============ */

    /*
     * Fetches RebalancingSetToken details. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - PerformanceFeeCalculator
     * - Any Liquidator
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchNewRebalancingSetDetails(
        IRebalancingSetTokenV3 _rebalancingSetToken
    )
        public
        view
        returns (
            RebalancingSetCreateInfo memory,
            PerformanceFeeLibrary.FeeState memory,
            CollateralSetInfo memory,
            address
        )
    {
        RebalancingSetCreateInfo memory rbSetInfo = getRebalancingSetInfo(
            address(_rebalancingSetToken)
        );

        PerformanceFeeLibrary.FeeState memory performanceFeeInfo = getPerformanceFeeState(
            address(_rebalancingSetToken)
        );

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(
            rbSetInfo.currentSet
        );

        address performanceFeeCalculatorAddress = address(_rebalancingSetToken.rebalanceFeeCalculator());

        return (rbSetInfo, performanceFeeInfo, collateralSetInfo, performanceFeeCalculatorAddress);
    }

    /*
     * Fetches all RebalancingSetToken state associated with a new rebalance auction. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - Any Fee Calculator
     * - Any liquidator (will omit additional TWAPLiquidator state)
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchRBSetRebalanceDetails(
        IRebalancingSetTokenV2 _rebalancingSetToken
    )
        public
        view
        returns (RebalancingSetRebalanceInfo memory, CollateralSetInfo memory)
    {
        uint256[] memory auctionParams = _rebalancingSetToken.getAuctionPriceParameters();
        uint256[] memory biddingParams = _rebalancingSetToken.getBiddingParameters();

        RebalancingSetRebalanceInfo memory rbSetInfo = RebalancingSetRebalanceInfo({
            rebalanceStartTime: auctionParams[0],
            timeToPivot: auctionParams[1],
            startPrice: auctionParams[2],
            endPrice: auctionParams[3],
            startingCurrentSets: _rebalancingSetToken.startingCurrentSetAmount(),
            remainingCurrentSets: biddingParams[1],
            minimumBid: biddingParams[0],
            rebalanceState: _rebalancingSetToken.rebalanceState(),
            nextSet: _rebalancingSetToken.nextSet(),
            liquidator: _rebalancingSetToken.liquidator()
        });

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(_rebalancingSetToken.nextSet());

        return (rbSetInfo, collateralSetInfo);
    }

    /*
     * Fetches all RebalancingSetToken state associated with a new TWAP rebalance auction. Compatible with:
     * - RebalancingSetTokenV2/V3
     * - Any Fee Calculator
     * - TWAPLiquidator
     *
     * @param  _rebalancingSetToken           RebalancingSetToken contract instance
     * @return RebalancingLibrary.State       Current rebalance state on the RebalancingSetToken
     * @return uint256[]                      Starting current set, start time, minimum bid, and remaining current sets
     */
    function fetchRBSetTWAPRebalanceDetails(
        IRebalancingSetTokenV2 _rebalancingSetToken
    )
        public
        view
        returns (TWAPRebalanceInfo memory, CollateralSetInfo memory)
    {
        uint256[] memory auctionParams = _rebalancingSetToken.getAuctionPriceParameters();
        uint256[] memory biddingParams = _rebalancingSetToken.getBiddingParameters();
        ILiquidator liquidator = _rebalancingSetToken.liquidator();

        ITWAPAuctionGetters twapStateGetters = ITWAPAuctionGetters(address(liquidator));

        TWAPRebalanceInfo memory rbSetInfo = TWAPRebalanceInfo({
            rebalanceStartTime: auctionParams[0],
            timeToPivot: auctionParams[1],
            startPrice: auctionParams[2],
            endPrice: auctionParams[3],
            startingCurrentSets: _rebalancingSetToken.startingCurrentSetAmount(),
            remainingCurrentSets: biddingParams[1],
            minimumBid: biddingParams[0],
            rebalanceState: _rebalancingSetToken.rebalanceState(),
            nextSet: _rebalancingSetToken.nextSet(),
            liquidator: liquidator,
            orderSize: twapStateGetters.getOrderSize(address(_rebalancingSetToken)),
            orderRemaining: twapStateGetters.getOrderRemaining(address(_rebalancingSetToken)),
            totalSetsRemaining: twapStateGetters.getTotalSetsRemaining(address(_rebalancingSetToken)),
            chunkSize: twapStateGetters.getChunkSize(address(_rebalancingSetToken)),
            chunkAuctionPeriod: twapStateGetters.getChunkAuctionPeriod(address(_rebalancingSetToken)),
            lastChunkAuctionEnd: twapStateGetters.getLastChunkAuctionEnd(address(_rebalancingSetToken))
        });

        CollateralSetInfo memory collateralSetInfo = getCollateralSetInfo(_rebalancingSetToken.nextSet());

        return (rbSetInfo, collateralSetInfo);
    }

    /* ============ Batch Fetch Functions ============ */

    /*
     * Fetches RebalancingSetToken states for an array of RebalancingSetToken instances
     *
     * @param  _rebalancingSetTokens[]       RebalancingSetToken contract instances
     * @return RebalancingLibrary.State[]    Current rebalance states on the RebalancingSetToken
     */
    function batchFetchRebalanceStateAsync(
        IRebalancingSetToken[] calldata _rebalancingSetTokens
    )
        external
        returns (RebalancingLibrary.State[] memory)
    {
        // Cache length of addresses to fetch states for
        uint256 _addressesCount = _rebalancingSetTokens.length;
        
        // Instantiate output array in memory
        RebalancingLibrary.State[] memory states = new RebalancingLibrary.State[](_addressesCount);

        // Cycle through contract addresses array and fetching the rebalance state of each RebalancingSet
        for (uint256 i = 0; i < _addressesCount; i++) {
            states[i] = _rebalancingSetTokens[i].rebalanceState();
        }

        return states;
    }

    /*
     * Fetches RebalancingSetToken unitShares for an array of RebalancingSetToken instances
     *
     * @param  _rebalancingSetTokens[]       RebalancingSetToken contract instances
     * @return uint256[]                     Current unitShares on the RebalancingSetToken
     */
    function batchFetchUnitSharesAsync(
        IRebalancingSetToken[] calldata _rebalancingSetTokens
    )
        external
        returns (uint256[] memory)
    {
        // Cache length of addresses to fetch states for
        uint256 _addressesCount = _rebalancingSetTokens.length;

        // Instantiate output array in memory
        uint256[] memory unitShares = new uint256[](_addressesCount);

        // Cycles through contract addresses array and fetches the unitShares of each RebalancingSet
        for (uint256 i = 0; i < _addressesCount; i++) {
            unitShares[i] = _rebalancingSetTokens[i].unitShares();
        }

        return unitShares;
    }

    /*
     * Fetches RebalancingSetToken liquidator for an array of RebalancingSetToken instances
     *
     * @param  _rebalancingSetTokens[]       RebalancingSetToken contract instances
     * @return address[]                     Current liquidator being used by RebalancingSetToken
     */
    function batchFetchLiquidator(
        IRebalancingSetTokenV2[] calldata _rebalancingSetTokens
    )
        external
        returns (address[] memory)
    {
        // Cache length of addresses to fetch states for
        uint256 _addressesCount = _rebalancingSetTokens.length;

        // Instantiate output array in memory
        address[] memory liquidators = new address[](_addressesCount);

        // Cycles through contract addresses array and fetches the liquidator addresss of each RebalancingSet
        for (uint256 i = 0; i < _addressesCount; i++) {
            liquidators[i] = address(_rebalancingSetTokens[i].liquidator());
        }

        return liquidators;
    }

    /*
     * Fetches RebalancingSetToken state and current collateral for an array of RebalancingSetToken instances
     *
     * @param  _rebalancingSetTokens[]       RebalancingSetToken contract instances
     * @return CollateralAndState[]          Current collateral and state of RebalancingSetTokens
     */
    function batchFetchStateAndCollateral(
        IRebalancingSetToken[] calldata _rebalancingSetTokens
    )
        external
        returns (CollateralAndState[] memory)
    {
        // Cache length of addresses to fetch states for
        uint256 _addressesCount = _rebalancingSetTokens.length;

        // Instantiate output array in memory
        CollateralAndState[] memory statuses = new CollateralAndState[](_addressesCount);

        // Cycles through contract addresses array and fetches the liquidator addresss of each RebalancingSet
        for (uint256 i = 0; i < _addressesCount; i++) {
            statuses[i].collateralSet = address(_rebalancingSetTokens[i].currentSet());
            statuses[i].state = _rebalancingSetTokens[i].rebalanceState();
        }

        return statuses;
    }

    /* ============ Internal Functions ============ */

    function getCollateralSetInfo(
        ISetToken _collateralSet
    )
        internal
        view
        returns (CollateralSetInfo memory)
    {
        return CollateralSetInfo({
            components: _collateralSet.getComponents(),
            units: _collateralSet.getUnits(),
            naturalUnit: _collateralSet.naturalUnit(),
            name: ERC20Detailed(address(_collateralSet)).name(),
            symbol: ERC20Detailed(address(_collateralSet)).symbol()
        });
    }

    function getRebalancingSetInfo(
        address _rebalancingSetToken
    )
        internal
        view
        returns (RebalancingSetCreateInfo memory)
    {
        IRebalancingSetTokenV2 rebalancingSetTokenV2Instance = IRebalancingSetTokenV2(_rebalancingSetToken);

        return RebalancingSetCreateInfo({
            manager: rebalancingSetTokenV2Instance.manager(),
            feeRecipient: rebalancingSetTokenV2Instance.feeRecipient(),
            currentSet: rebalancingSetTokenV2Instance.currentSet(),
            liquidator: rebalancingSetTokenV2Instance.liquidator(),
            unitShares: rebalancingSetTokenV2Instance.unitShares(),
            naturalUnit: rebalancingSetTokenV2Instance.naturalUnit(),
            rebalanceInterval: rebalancingSetTokenV2Instance.rebalanceInterval(),
            entryFee: rebalancingSetTokenV2Instance.entryFee(),
            rebalanceFee: rebalancingSetTokenV2Instance.rebalanceFee(),
            lastRebalanceTimestamp: rebalancingSetTokenV2Instance.lastRebalanceTimestamp(),
            rebalanceState: rebalancingSetTokenV2Instance.rebalanceState(),
            name: rebalancingSetTokenV2Instance.name(),
            symbol: rebalancingSetTokenV2Instance.symbol()
        });
    }

    function getPerformanceFeeState(
        address _rebalancingSetToken
    )
        internal
        view
        returns (PerformanceFeeLibrary.FeeState memory)
    {
        IRebalancingSetTokenV2 rebalancingSetTokenV3Instance = IRebalancingSetTokenV2(_rebalancingSetToken);

        address rebalanceFeeCalculatorAddress = address(rebalancingSetTokenV3Instance.rebalanceFeeCalculator());
        return IPerformanceFeeCalculator(rebalanceFeeCalculatorAddress).feeState(_rebalancingSetToken);
    }
}

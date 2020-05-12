/*
    Copyright 2020 Set Labs Inc.

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

import { IOracle } from "set-protocol-oracles/contracts/meta-oracles/interfaces/IOracle.sol";


/**
 * @title OracleViewer
 * @author Set Protocol
 *
 * Contract for fetching oracle state
 */
contract OracleViewer {
    /*
     * Fetches RebalancingSetToken liquidator for an array of RebalancingSetToken instances
     *
     * @param  _rebalancingSetTokens[]       RebalancingSetToken contract instances
     * @return address[]                     Current liquidator being used by RebalancingSetToken
     */
    function batchFetchOraclePrices(
        IOracle[] calldata _oracles
    )
        external
        returns (uint256[] memory)
    {
        // Cache length of addresses to fetch states for
        uint256 _addressesCount = _oracles.length;

        // Instantiate output array in memory
        uint256[] memory prices = new uint256[](_addressesCount);

        // Cycles through contract addresses array and fetches the current price of each oracle
        for (uint256 i = 0; i < _addressesCount; i++) {
            prices[i] = _oracles[i].read();
        }

        return prices;
    }
}

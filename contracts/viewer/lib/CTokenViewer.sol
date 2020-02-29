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

import { ICToken } from "set-protocol-contracts/contracts/core/interfaces/ICToken.sol";


/**
 * @title CTokenViewer
 * @author Set Protocol
 *
 * Interface for batch fetching the on-chain Compound exchange rate
 */
contract CTokenViewer {

    function batchFetchExchangeRateStored(
        address[] calldata _cTokenAddresses
    )
        external
        view
        returns (uint256[] memory)
    {
        // Cache length of addresses to fetch exchange rates for
        uint256 _addressesCount = _cTokenAddresses.length;
        
        // Instantiate output array in memory
        uint256[] memory cTokenExchangeRates = new uint256[](_addressesCount);

        // Cycle through contract addresses array and fetching the balance of each for the owner
        for (uint256 i = 0; i < _addressesCount; i++) {
            cTokenExchangeRates[i] = ICToken(_cTokenAddresses[i]).exchangeRateStored();
        }

        return cTokenExchangeRates;
    }
}

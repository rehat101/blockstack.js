'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.network = exports.BlockchainInfoApi = exports.InsightClient = exports.BitcoindAPI = exports.LocalRegtest = exports.BlockstackNetwork = exports.BitcoinNetwork = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _bitcoinjsLib = require('bitcoinjs-lib');

var _bitcoinjsLib2 = _interopRequireDefault(_bitcoinjsLib);

var _formData = require('form-data');

var _formData2 = _interopRequireDefault(_formData);

var _bigi = require('bigi');

var _bigi2 = _interopRequireDefault(_bigi);

var _ripemd = require('ripemd160');

var _ripemd2 = _interopRequireDefault(_ripemd);

var _errors = require('./errors');

var _logger = require('./logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SATOSHIS_PER_BTC = 1e8;
var TX_BROADCAST_SERVICE_ZONE_FILE_ENDPOINT = 'zone-file';
var TX_BROADCAST_SERVICE_REGISTRATION_ENDPOINT = 'registration';
var TX_BROADCAST_SERVICE_TX_ENDPOINT = 'transaction';

var BitcoinNetwork = exports.BitcoinNetwork = function () {
  function BitcoinNetwork() {
    _classCallCheck(this, BitcoinNetwork);
  }

  _createClass(BitcoinNetwork, [{
    key: 'broadcastTransaction',
    value: function broadcastTransaction(transaction) {
      return Promise.reject(new Error('Not implemented, broadcastTransaction(' + transaction + ')'));
    }
  }, {
    key: 'getBlockHeight',
    value: function getBlockHeight() {
      return Promise.reject(new Error('Not implemented, getBlockHeight()'));
    }
  }, {
    key: 'getTransactionInfo',
    value: function getTransactionInfo(txid) {
      return Promise.reject(new Error('Not implemented, getTransactionInfo(' + txid + ')'));
    }
  }, {
    key: 'getNetworkedUTXOs',
    value: function getNetworkedUTXOs(address) {
      return Promise.reject(new Error('Not implemented, getNetworkedUTXOs(' + address + ')'));
    }
  }]);

  return BitcoinNetwork;
}();

var BlockstackNetwork = exports.BlockstackNetwork = function () {
  function BlockstackNetwork(apiUrl, broadcastServiceUrl, bitcoinAPI) {
    var network = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _bitcoinjsLib2.default.networks.bitcoin;

    _classCallCheck(this, BlockstackNetwork);

    this.blockstackAPIUrl = apiUrl;
    this.broadcastServiceUrl = broadcastServiceUrl;
    this.layer1 = network;
    this.btc = bitcoinAPI;

    this.DUST_MINIMUM = 5500;
    this.includeUtxoMap = {};
    this.excludeUtxoSet = [];
    this.MAGIC_BYTES = 'id';
  }

  _createClass(BlockstackNetwork, [{
    key: 'coerceAddress',
    value: function coerceAddress(address) {
      var _bitcoinjs$address$fr = _bitcoinjsLib2.default.address.fromBase58Check(address),
          hash = _bitcoinjs$address$fr.hash,
          version = _bitcoinjs$address$fr.version;

      var scriptHashes = [_bitcoinjsLib2.default.networks.bitcoin.scriptHash, _bitcoinjsLib2.default.networks.testnet.scriptHash];
      var pubKeyHashes = [_bitcoinjsLib2.default.networks.bitcoin.pubKeyHash, _bitcoinjsLib2.default.networks.testnet.pubKeyHash];
      var coercedVersion = void 0;
      if (scriptHashes.indexOf(version) >= 0) {
        coercedVersion = this.layer1.scriptHash;
      } else if (pubKeyHashes.indexOf(version) >= 0) {
        coercedVersion = this.layer1.pubKeyHash;
      } else {
        throw new Error('Unrecognized address version number ' + version + ' in ' + address);
      }
      return _bitcoinjsLib2.default.address.toBase58Check(hash, coercedVersion);
    }
  }, {
    key: 'getDefaultBurnAddress',
    value: function getDefaultBurnAddress() {
      return this.coerceAddress('1111111111111111111114oLvT2');
    }

    /**
     * Get the price of a name via the legacy /v1/prices API endpoint.
     * @param {String} fullyQualifiedName the name to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }
     * @private
     */

  }, {
    key: 'getNamePriceV1',
    value: function getNamePriceV1(fullyQualifiedName) {
      var _this = this;

      // legacy code path
      return fetch(this.blockstackAPIUrl + '/v1/prices/names/' + fullyQualifiedName).then(function (resp) {
        if (!resp.ok) {
          throw new Error('Failed to query name price for ' + fullyQualifiedName);
        }
        return resp;
      }).then(function (resp) {
        return resp.json();
      }).then(function (resp) {
        return resp.name_price;
      }).then(function (namePrice) {
        if (!namePrice || !namePrice.satoshis) {
          throw new Error('Failed to get price for ' + fullyQualifiedName + '. Does the namespace exist?');
        }
        if (namePrice.satoshis < _this.DUST_MINIMUM) {
          namePrice.satoshis = _this.DUST_MINIMUM;
        }
        var result = {
          units: 'BTC',
          amount: _bigi2.default.fromByteArrayUnsigned(String(namePrice.satoshis))
        };
        return result;
      });
    }

    /**
     * Get the price of a namespace via the legacy /v1/prices API endpoint.
     * @param {String} namespaceID the namespace to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }
     * @private
     */

  }, {
    key: 'getNamespacePriceV1',
    value: function getNamespacePriceV1(namespaceID) {
      var _this2 = this;

      // legacy code path
      return fetch(this.blockstackAPIUrl + '/v1/prices/namespaces/' + namespaceID).then(function (resp) {
        if (!resp.ok) {
          throw new Error('Failed to query name price for ' + namespaceID);
        }
        return resp;
      }).then(function (resp) {
        return resp.json();
      }).then(function (namespacePrice) {
        if (!namespacePrice || !namespacePrice.satoshis) {
          throw new Error('Failed to get price for ' + namespaceID);
        }
        if (namespacePrice.satoshis < _this2.DUST_MINIMUM) {
          namespacePrice.satoshis = _this2.DUST_MINIMUM;
        }
        var result = {
          units: 'BTC',
          amount: _bigi2.default.fromByteArrayUnsigned(String(namespacePrice.satoshis))
        };
        return result;
      });
    }

    /**
     * Get the price of a name via the /v2/prices API endpoint.
     * @param {String} fullyQualifiedName the name to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }
     * @private
     */

  }, {
    key: 'getNamePriceV2',
    value: function getNamePriceV2(fullyQualifiedName) {
      var _this3 = this;

      return fetch(this.blockstackAPIUrl + '/v2/prices/names/' + fullyQualifiedName).then(function (resp) {
        if (resp.status !== 200) {
          // old core node 
          throw new Error('The upstream node does not handle the /v2/ price namespace');
        }
        return resp;
      }).then(function (resp) {
        return resp.json();
      }).then(function (resp) {
        return resp.name_price;
      }).then(function (namePrice) {
        if (!namePrice) {
          throw new Error('Failed to get price for ' + fullyQualifiedName + '. Does the namespace exist?');
        }
        var result = {
          units: namePrice.units,
          amount: _bigi2.default.fromByteArrayUnsigned(namePrice.amount)
        };
        if (namePrice.units === 'BTC') {
          // must be at least dust-minimum
          var dustMin = _bigi2.default.fromByteArrayUnsigned(String(_this3.DUST_MINIMUM));
          if (result.amount.compareTo(dustMin) < 0) {
            result.amount = dustMin;
          }
        }
        return result;
      });
    }

    /**
     * Get the price of a namespace via the /v2/prices API endpoint.
     * @param {String} namespaceID the namespace to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }
     * @private
     */

  }, {
    key: 'getNamespacePriceV2',
    value: function getNamespacePriceV2(namespaceID) {
      var _this4 = this;

      return fetch(this.blockstackAPIUrl + '/v2/prices/namespaces/' + namespaceID).then(function (resp) {
        if (resp.status !== 200) {
          // old core node 
          throw new Error('The upstream node does not handle the /v2/ price namespace');
        }
        return resp;
      }).then(function (resp) {
        return resp.json();
      }).then(function (namespacePrice) {
        if (!namespacePrice) {
          throw new Error('Failed to get price for ' + namespaceID);
        }
        var result = {
          units: namespacePrice.units,
          amount: _bigi2.default.fromByteArrayUnsigned(namespacePrice.amount)
        };
        if (namespacePrice.units === 'BTC') {
          // must be at least dust-minimum
          var dustMin = _bigi2.default.fromByteArrayUnsigned(String(_this4.DUST_MINIMUM));
          if (result.amount.compareTo(dustMin) < 0) {
            result.amount = dustMin;
          }
        }
        return result;
      });
    }

    /**
     * Get the price of a name.
     * @param {String} fullyQualifiedName the name to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }, where
     *   .units encodes the cryptocurrency units to pay (e.g. BTC, STACKS), and
     *   .amount encodes the number of units, in the smallest denominiated amount
     *   (e.g. if .units is BTC, .amount will be satoshis; if .units is STACKS, 
     *   .amount will be microStacks)
     */

  }, {
    key: 'getNamePrice',
    value: function getNamePrice(fullyQualifiedName) {
      var _this5 = this;

      // handle v1 or v2 
      return Promise.resolve().then(function () {
        return _this5.getNamePriceV2(fullyQualifiedName);
      }).catch(function () {
        return _this5.getNamePriceV1(fullyQualifiedName);
      });
    }

    /**
     * Get the price of a namespace
     * @param {String} namespaceID the namespace to query
     * @return {Promise} a promise to an Object with { units: String, amount: BigInteger }, where
     *   .units encodes the cryptocurrency units to pay (e.g. BTC, STACKS), and
     *   .amount encodes the number of units, in the smallest denominiated amount
     *   (e.g. if .units is BTC, .amount will be satoshis; if .units is STACKS, 
     *   .amount will be microStacks)
     */

  }, {
    key: 'getNamespacePrice',
    value: function getNamespacePrice(namespaceID) {
      var _this6 = this;

      // handle v1 or v2 
      return Promise.resolve().then(function () {
        return _this6.getNamespacePriceV2(namespaceID);
      }).catch(function () {
        return _this6.getNamespacePriceV1(namespaceID);
      });
    }

    /**
     * How many blocks can pass between a name expiring and the name being able to be
     * re-registered by a different owner?
     * @return {Promise} a promise to the number of blocks
     */

  }, {
    key: 'getGracePeriod',
    value: function getGracePeriod() {
      return new Promise(function (resolve) {
        return resolve(5000);
      });
    }

    /**
     * Get the names -- both on-chain and off-chain -- owned by an address.
     * @param {String} address the blockchain address (the hash of the owner public key)
     * @return {Promise} a promise that resolves to a list of names (Strings)
     */

  }, {
    key: 'getNamesOwned',
    value: function getNamesOwned(address) {
      var networkAddress = this.coerceAddress(address);
      return fetch(this.blockstackAPIUrl + '/v1/addresses/bitcoin/' + networkAddress).then(function (resp) {
        return resp.json();
      }).then(function (obj) {
        return obj.names;
      });
    }

    /**
     * Get the blockchain address to which a name's registration fee must be sent
     * (the address will depend on the namespace in which it is registered.)
     * @param {String} namespace the namespace ID
     * @return {Promise} a promise that resolves to an address (String)
     */

  }, {
    key: 'getNamespaceBurnAddress',
    value: function getNamespaceBurnAddress(namespace) {
      var _this7 = this;

      return Promise.all([fetch(this.blockstackAPIUrl + '/v1/namespaces/' + namespace), this.getBlockHeight()]).then(function (_ref) {
        var _ref2 = _slicedToArray(_ref, 2),
            resp = _ref2[0],
            blockHeight = _ref2[1];

        if (resp.status === 404) {
          throw new Error('No such namespace \'' + namespace + '\'');
        } else {
          return Promise.all([resp.json(), blockHeight]);
        }
      }).then(function (_ref3) {
        var _ref4 = _slicedToArray(_ref3, 2),
            namespaceInfo = _ref4[0],
            blockHeight = _ref4[1];

        var address = _this7.getDefaultBurnAddress();
        if (namespaceInfo.version === 2) {
          // pay-to-namespace-creator if this namespace is less than 1 year old
          if (namespaceInfo.reveal_block + 52595 >= blockHeight) {
            address = namespaceInfo.address;
          }
        }
        return address;
      }).then(function (address) {
        return _this7.coerceAddress(address);
      });
    }

    /**
     * Get WHOIS-like information for a name, including the address that owns it,
     * the block at which it expires, and the zone file anchored to it (if available).
     * @param {String} fullyQualifiedName the name to query.  Can be on-chain of off-chain.
     * @return {Promise} a promise that resolves to the WHOIS-like information 
     */

  }, {
    key: 'getNameInfo',
    value: function getNameInfo(fullyQualifiedName) {
      var _this8 = this;

      return fetch(this.blockstackAPIUrl + '/v1/names/' + fullyQualifiedName).then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Name not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (nameInfo) {
        // the returned address _should_ be in the correct network ---
        //  blockstackd gets into trouble because it tries to coerce back to mainnet
        //  and the regtest transaction generation libraries want to use testnet addresses
        if (nameInfo.address) {
          return Object.assign({}, nameInfo, { address: _this8.coerceAddress(nameInfo.address) });
        } else {
          return nameInfo;
        }
      });
    }

    /**
     * Get the pricing parameters and creation history of a namespace.
     * @param {String} namespaceID the namespace to query
     * @return {Promise} a promise that resolves to the namespace information.
     */

  }, {
    key: 'getNamespaceInfo',
    value: function getNamespaceInfo(namespaceID) {
      var _this9 = this;

      return fetch(this.blockstackAPIUrl + '/v1/namespaces/' + namespaceID).then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Namespace not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (namespaceInfo) {
        // the returned address _should_ be in the correct network ---
        //  blockstackd gets into trouble because it tries to coerce back to mainnet
        //  and the regtest transaction generation libraries want to use testnet addresses
        if (namespaceInfo.address && namespaceInfo.recipient_address) {
          return Object.assign({}, namespaceInfo, {
            address: _this9.coerceAddress(namespaceInfo.address),
            recipient_address: _this9.coerceAddress(namespaceInfo.recipient_address)
          });
        } else {
          return namespaceInfo;
        }
      });
    }

    /**
     * Get a zone file, given its hash.  Throws an exception if the zone file
     * obtained does not match the hash.
     * @param {String} zonefileHash the ripemd160(sha256) hash of the zone file
     * @return {Promise} a promise that resolves to the zone file's text
     */

  }, {
    key: 'getZonefile',
    value: function getZonefile(zonefileHash) {
      return fetch(this.blockstackAPIUrl + '/v1/zonefiles/' + zonefileHash).then(function (resp) {
        if (resp.status === 200) {
          return resp.text().then(function (body) {
            var sha256 = _bitcoinjsLib2.default.crypto.sha256(body);
            var h = new _ripemd2.default().update(sha256).digest('hex');
            if (h !== zonefileHash) {
              throw new Error('Zone file contents hash to ' + h + ', not ' + zonefileHash);
            }
            return body;
          });
        } else {
          throw new Error('Bad response status: ' + resp.status);
        }
      });
    }

    /**
     * Get the status of an account for a particular token holding.  This includes its total number of
     * expenditures and credits, lockup times, last txid, and so on.
     * @param {String} address the account
     * @param {String} tokenType the token type to query
     * @return {Promise} a promise that resolves to an object representing the state of the account
     *   for this token
     */

  }, {
    key: 'getAccountStatus',
    value: function getAccountStatus(address, tokenType) {
      var _this10 = this;

      return fetch(this.blockstackAPIUrl + '/v1/accounts/' + address + '/' + tokenType + '/status').then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Account not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (accountStatus) {
        // coerce all addresses, and convert credit/debit to biginteger
        var formattedStatus = Object.assign({}, accountStatus, {
          address: _this10.coerceAddress(accountStatus.address),
          debit_value: _bigi2.default.fromByteArrayUnsigned(String(accountStatus.debit_value)),
          credit_value: _bigi2.default.fromByteArrayUnsigned(String(accountStatus.credit_value))
        });
        return formattedStatus;
      });
    }

    /**
     * Get a page of an account's transaction history.
     * @param {String} address the account's address
     * @param {number} page the page number.  Page 0 is the most recent transactions
     * @return {Promise} a promise that resolves to an Array of Objects, where each Object encodes
     *   states of the account at various block heights (e.g. prior balances, txids, etc)
     */

  }, {
    key: 'getAccountHistoryPage',
    value: function getAccountHistoryPage(address, page) {
      var _this11 = this;

      var url = this.blockstackAPIUrl + '/v1/accounts/' + address + '/history?page=' + page;
      return fetch(url).then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Account not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (historyList) {
        if (historyList.error) {
          throw new Error('Unable to get account history page: ' + historyList.error);
        }
        // coerse all addresses and convert to bigint
        return historyList.map(function (histEntry) {
          histEntry.address = _this11.coerceAddress(histEntry.address);
          histEntry.debit_value = _bigi2.default.fromByteArrayUnsigned(String(histEntry.debit_value));
          histEntry.credit_value = _bigi2.default.fromByteArrayUnsigned(String(histEntry.credit_value));
          return histEntry;
        });
      });
    }

    /**
     * Get the state(s) of an account at a particular block height.  This includes the state of the
     * account beginning with this block's transactions, as well as all of the states the account
     * passed through when this block was processed (if any).
     * @param {String} address the account's address
     * @param {Integer} blockHeight the block to query
     * @return {Promise} a promise that resolves to an Array of Objects, where each Object encodes
     *   states of the account at this block.
     */

  }, {
    key: 'getAccountAt',
    value: function getAccountAt(address, blockHeight) {
      var _this12 = this;

      var url = this.blockstackAPIUrl + '/v1/accounts/' + address + '/history/' + blockHeight;
      return fetch(url).then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Account not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (historyList) {
        if (historyList.error) {
          throw new Error('Unable to get historic account state: ' + historyList.error);
        }
        // coerce all addresses 
        return historyList.map(function (histEntry) {
          histEntry.address = _this12.coerceAddress(histEntry.address);
          histEntry.debit_value = _bigi2.default.fromByteArrayUnsigned(String(histEntry.debit_value));
          histEntry.credit_value = _bigi2.default.fromByteArrayUnsigned(String(histEntry.credit_value));
          return histEntry;
        });
      });
    }

    /**
     * Get the set of token types that this account owns
     * @param {String} address the account's address
     * @return {Promise} a promise that resolves to an Array of Strings, where each item encodes the 
     *   type of token this account holds (excluding the underlying blockchain's tokens)
     */

  }, {
    key: 'getAccountTokens',
    value: function getAccountTokens(address) {
      return fetch(this.blockstackAPIUrl + '/v1/accounts/' + address + '/tokens').then(function (resp) {
        if (resp.status === 404) {
          throw new Error('Account not found');
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (tokenList) {
        if (tokenList.error) {
          throw new Error('Unable to get token list: ' + tokenList.error);
        }
        return tokenList;
      });
    }

    /**
     * Get the number of tokens owned by an account.  If the account does not exist or has no
     * tokens of this type, then 0 will be returned.
     * @param {String} address the account's address
     * @param {String} tokenType the type of token to query.
     * @return {Promise} a promise that resolves to a BigInteger that encodes the number of tokens 
     *   held by this account.
     */

  }, {
    key: 'getAccountBalance',
    value: function getAccountBalance(address, tokenType) {
      return fetch(this.blockstackAPIUrl + '/v1/accounts/' + address + '/' + tokenType + '/balance').then(function (resp) {
        if (resp.status === 404) {
          // talking to an older blockstack core node without the accounts API
          return Promise.resolve().then(function () {
            return _bigi2.default.fromByteArrayUnsigned('0');
          });
        } else if (resp.status !== 200) {
          throw new Error('Bad response status: ' + resp.status);
        } else {
          return resp.json();
        }
      }).then(function (tokenBalance) {
        if (tokenBalance.error) {
          throw new Error('Unable to get account balance: ' + tokenBalance.error);
        }
        var balance = '0';
        if (tokenBalance && tokenBalance.balance) {
          balance = tokenBalance.balance;
        }
        return _bigi2.default.fromByteArrayUnsigned(balance);
      });
    }

    /**
     * Performs a POST request to the given URL
     * @param  {String} endpoint  the name of
     * @param  {String} body [description]
     * @return {Promise<Object|Error>} Returns a `Promise` that resolves to the object requested.
     * In the event of an error, it rejects with:
     * * a `RemoteServiceError` if there is a problem
     * with the transaction broadcast service
     * * `MissingParameterError` if you call the function without a required
     * parameter
     *
     * @private
     */

  }, {
    key: 'broadcastServiceFetchHelper',
    value: function broadcastServiceFetchHelper(endpoint, body) {
      var requestHeaders = {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      };

      var options = {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body)
      };

      var url = this.broadcastServiceUrl + '/v1/broadcast/' + endpoint;
      return fetch(url, options).then(function (response) {
        if (response.ok) {
          return response.json();
        } else {
          throw new _errors.RemoteServiceError(response);
        }
      });
    }

    /**
    * Broadcasts a signed bitcoin transaction to the network optionally waiting to broadcast the
    * transaction until a second transaction has a certain number of confirmations.
    *
    * @param  {string} transaction the hex-encoded transaction to broadcast
    * @param  {string} transactionToWatch the hex transaction id of the transaction to watch for
    * the specified number of confirmations before broadcasting the `transaction`
    * @param  {number} confirmations the number of confirmations `transactionToWatch` must have
    * before broadcasting `transaction`.
    * @return {Promise<Object|Error>} Returns a Promise that resolves to an object with a
    * `transaction_hash` key containing the transaction hash of the broadcasted transaction.
    *
    * In the event of an error, it rejects with:
    * * a `RemoteServiceError` if there is a problem
    *   with the transaction broadcast service
    * * `MissingParameterError` if you call the function without a required
    *   parameter
    * @private
    */

  }, {
    key: 'broadcastTransaction',
    value: function broadcastTransaction(transaction) {
      var transactionToWatch = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
      var confirmations = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 6;

      if (!transaction) {
        var error = new _errors.MissingParameterError('transaction');
        return Promise.reject(error);
      }

      if (!confirmations && confirmations !== 0) {
        var _error = new _errors.MissingParameterError('confirmations');
        return Promise.reject(_error);
      }

      if (transactionToWatch === null) {
        return this.btc.broadcastTransaction(transaction);
      } else {
        /*
         * POST /v1/broadcast/transaction
         * Request body:
         * JSON.stringify({
         *  transaction,
         *  transactionToWatch,
         *  confirmations
         * })
         */
        var endpoint = TX_BROADCAST_SERVICE_TX_ENDPOINT;

        var requestBody = {
          transaction: transaction,
          transactionToWatch: transactionToWatch,
          confirmations: confirmations
        };

        return this.broadcastServiceFetchHelper(endpoint, requestBody);
      }
    }

    /**
     * Broadcasts a zone file to the Atlas network via the transaction broadcast service.
     *
     * @param  {String} zoneFile the zone file to be broadcast to the Atlas network
     * @param  {String} transactionToWatch the hex transaction id of the transaction
     * to watch for confirmation before broadcasting the zone file to the Atlas network
     * @return {Promise<Object|Error>} Returns a Promise that resolves to an object with a
     * `transaction_hash` key containing the transaction hash of the broadcasted transaction.
     *
     * In the event of an error, it rejects with:
     * * a `RemoteServiceError` if there is a problem
     *   with the transaction broadcast service
     * * `MissingParameterError` if you call the function without a required
     *   parameter
     * @private
     */

  }, {
    key: 'broadcastZoneFile',
    value: function broadcastZoneFile(zoneFile) {
      var transactionToWatch = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

      if (!zoneFile) {
        return Promise.reject(new _errors.MissingParameterError('zoneFile'));
      }

      // TODO: validate zonefile

      if (transactionToWatch) {
        // broadcast via transaction broadcast service

        /*
         * POST /v1/broadcast/zone-file
         * Request body:
         * JSON.stringify({
         *  zoneFile,
         *  transactionToWatch
         * })
         */

        var requestBody = {
          zoneFile: zoneFile,
          transactionToWatch: transactionToWatch
        };

        var endpoint = TX_BROADCAST_SERVICE_ZONE_FILE_ENDPOINT;

        return this.broadcastServiceFetchHelper(endpoint, requestBody);
      } else {
        // broadcast via core endpoint

        // zone file is two words but core's api treats it as one word 'zonefile'
        var _requestBody = { zonefile: zoneFile };

        return fetch(this.blockstackAPIUrl + '/v1/zonefile/', {
          method: 'POST',
          body: JSON.stringify(_requestBody),
          headers: {
            'Content-Type': 'application/json'
          }
        }).then(function (resp) {
          var json = resp.json();
          return json.then(function (respObj) {
            if (respObj.hasOwnProperty('error')) {
              throw new _errors.RemoteServiceError(resp);
            }
            return respObj.servers;
          });
        });
      }
    }

    /**
     * Sends the preorder and registration transactions and zone file
     * for a Blockstack name registration
     * along with the to the transaction broadcast service.
     *
     * The transaction broadcast:
     *
     * * immediately broadcasts the preorder transaction
     * * broadcasts the register transactions after the preorder transaction
     * has an appropriate number of confirmations
     * * broadcasts the zone file to the Atlas network after the register transaction
     * has an appropriate number of confirmations
     *
     * @param  {String} preorderTransaction the hex-encoded, signed preorder transaction generated
     * using the `makePreorder` function
     * @param  {String} registerTransaction the hex-encoded, signed register transaction generated
     * using the `makeRegister` function
     * @param  {String} zoneFile the zone file to be broadcast to the Atlas network
     * @return {Promise<Object|Error>} Returns a Promise that resolves to an object with a
     * `transaction_hash` key containing the transaction hash of the broadcasted transaction.
     *
     * In the event of an error, it rejects with:
     * * a `RemoteServiceError` if there is a problem
     *   with the transaction broadcast service
     * * `MissingParameterError` if you call the function without a required
     *   parameter
     * @private
     */

  }, {
    key: 'broadcastNameRegistration',
    value: function broadcastNameRegistration(preorderTransaction, registerTransaction, zoneFile) {
      /*
         * POST /v1/broadcast/registration
         * Request body:
         * JSON.stringify({
         * preorderTransaction,
         * registerTransaction,
         * zoneFile
         * })
         */

      if (!preorderTransaction) {
        var error = new _errors.MissingParameterError('preorderTransaction');
        return Promise.reject(error);
      }

      if (!registerTransaction) {
        var _error2 = new _errors.MissingParameterError('registerTransaction');
        return Promise.reject(_error2);
      }

      if (!zoneFile) {
        var _error3 = new _errors.MissingParameterError('zoneFile');
        return Promise.reject(_error3);
      }

      var requestBody = {
        preorderTransaction: preorderTransaction,
        registerTransaction: registerTransaction,
        zoneFile: zoneFile
      };

      var endpoint = TX_BROADCAST_SERVICE_REGISTRATION_ENDPOINT;

      return this.broadcastServiceFetchHelper(endpoint, requestBody);
    }
  }, {
    key: 'getFeeRate',
    value: function getFeeRate() {
      return fetch('https://bitcoinfees.earn.com/api/v1/fees/recommended').then(function (resp) {
        return resp.json();
      }).then(function (rates) {
        return Math.floor(rates.fastestFee);
      });
    }
  }, {
    key: 'countDustOutputs',
    value: function countDustOutputs() {
      throw new Error('Not implemented.');
    }
  }, {
    key: 'getUTXOs',
    value: function getUTXOs(address) {
      var _this13 = this;

      return this.getNetworkedUTXOs(address).then(function (networkedUTXOs) {
        var returnSet = networkedUTXOs.concat();
        if (_this13.includeUtxoMap.hasOwnProperty(address)) {
          returnSet = networkedUTXOs.concat(_this13.includeUtxoMap[address]);
        }

        // aaron: I am *well* aware this is O(n)*O(m) runtime
        //    however, clients should clear the exclude set periodically
        var excludeSet = _this13.excludeUtxoSet;
        returnSet = returnSet.filter(function (utxo) {
          var inExcludeSet = excludeSet.reduce(function (inSet, utxoToCheck) {
            return inSet || utxoToCheck.tx_hash === utxo.tx_hash && utxoToCheck.tx_output_n === utxo.tx_output_n;
          }, false);
          return !inExcludeSet;
        });

        return returnSet;
      });
    }

    /**
     * This will modify the network's utxo set to include UTXOs
     *  from the given transaction and exclude UTXOs *spent* in
     *  that transaction
     * @param {String} txHex - the hex-encoded transaction to use
     * @return {void} no return value, this modifies the UTXO config state
     * @private
     */

  }, {
    key: 'modifyUTXOSetFrom',
    value: function modifyUTXOSetFrom(txHex) {
      var _this14 = this;

      var tx = _bitcoinjsLib2.default.Transaction.fromHex(txHex);

      var excludeSet = this.excludeUtxoSet.concat();

      tx.ins.forEach(function (utxoUsed) {
        var reverseHash = Buffer.from(utxoUsed.hash);
        reverseHash.reverse();
        excludeSet.push({
          tx_hash: reverseHash.toString('hex'),
          tx_output_n: utxoUsed.index
        });
      });

      this.excludeUtxoSet = excludeSet;

      var txHash = tx.getHash().reverse().toString('hex');
      tx.outs.forEach(function (utxoCreated, txOutputN) {
        var isNullData = function isNullData(script) {
          try {
            _bitcoinjsLib2.default.payments.embed({ output: script }, { validate: true });
            return true;
          } catch (_) {
            return false;
          }
        };
        if (isNullData(utxoCreated.script)) {
          return;
        }
        var address = _bitcoinjsLib2.default.address.fromOutputScript(utxoCreated.script, _this14.layer1);

        var includeSet = [];
        if (_this14.includeUtxoMap.hasOwnProperty(address)) {
          includeSet = includeSet.concat(_this14.includeUtxoMap[address]);
        }

        includeSet.push({
          tx_hash: txHash,
          confirmations: 0,
          value: utxoCreated.value,
          tx_output_n: txOutputN
        });
        _this14.includeUtxoMap[address] = includeSet;
      });
    }
  }, {
    key: 'resetUTXOs',
    value: function resetUTXOs(address) {
      delete this.includeUtxoMap[address];
      this.excludeUtxoSet = [];
    }
  }, {
    key: 'getConsensusHash',
    value: function getConsensusHash() {
      return fetch(this.blockstackAPIUrl + '/v1/blockchains/bitcoin/consensus').then(function (resp) {
        return resp.json();
      }).then(function (x) {
        return x.consensus_hash;
      });
    }
  }, {
    key: 'getTransactionInfo',
    value: function getTransactionInfo(txHash) {
      return this.btc.getTransactionInfo(txHash);
    }
  }, {
    key: 'getBlockHeight',
    value: function getBlockHeight() {
      return this.btc.getBlockHeight();
    }
  }, {
    key: 'getNetworkedUTXOs',
    value: function getNetworkedUTXOs(address) {
      return this.btc.getNetworkedUTXOs(address);
    }
  }]);

  return BlockstackNetwork;
}();

var LocalRegtest = exports.LocalRegtest = function (_BlockstackNetwork) {
  _inherits(LocalRegtest, _BlockstackNetwork);

  function LocalRegtest(apiUrl, broadcastServiceUrl, bitcoinAPI) {
    _classCallCheck(this, LocalRegtest);

    return _possibleConstructorReturn(this, (LocalRegtest.__proto__ || Object.getPrototypeOf(LocalRegtest)).call(this, apiUrl, broadcastServiceUrl, bitcoinAPI, _bitcoinjsLib2.default.networks.testnet));
  }

  _createClass(LocalRegtest, [{
    key: 'getFeeRate',
    value: function getFeeRate() {
      return Promise.resolve(Math.floor(0.00001000 * SATOSHIS_PER_BTC));
    }
  }]);

  return LocalRegtest;
}(BlockstackNetwork);

var BitcoindAPI = exports.BitcoindAPI = function (_BitcoinNetwork) {
  _inherits(BitcoindAPI, _BitcoinNetwork);

  function BitcoindAPI(bitcoindUrl, bitcoindCredentials) {
    _classCallCheck(this, BitcoindAPI);

    var _this16 = _possibleConstructorReturn(this, (BitcoindAPI.__proto__ || Object.getPrototypeOf(BitcoindAPI)).call(this));

    _this16.bitcoindUrl = bitcoindUrl;
    _this16.bitcoindCredentials = bitcoindCredentials;
    _this16.importedBefore = {};
    return _this16;
  }

  _createClass(BitcoindAPI, [{
    key: 'broadcastTransaction',
    value: function broadcastTransaction(transaction) {
      var jsonRPC = {
        jsonrpc: '1.0',
        method: 'sendrawtransaction',
        params: [transaction]
      };
      var authString = Buffer.from(this.bitcoindCredentials.username + ':' + this.bitcoindCredentials.password).toString('base64');
      var headers = { Authorization: 'Basic ' + authString };
      return fetch(this.bitcoindUrl, {
        method: 'POST',
        body: JSON.stringify(jsonRPC),
        headers: headers
      }).then(function (resp) {
        return resp.json();
      }).then(function (respObj) {
        return respObj.result;
      });
    }
  }, {
    key: 'getBlockHeight',
    value: function getBlockHeight() {
      var jsonRPC = {
        jsonrpc: '1.0',
        method: 'getblockcount'
      };
      var authString = Buffer.from(this.bitcoindCredentials.username + ':' + this.bitcoindCredentials.password).toString('base64');
      var headers = { Authorization: 'Basic ' + authString };
      return fetch(this.bitcoindUrl, {
        method: 'POST',
        body: JSON.stringify(jsonRPC),
        headers: headers
      }).then(function (resp) {
        return resp.json();
      }).then(function (respObj) {
        return respObj.result;
      });
    }
  }, {
    key: 'getTransactionInfo',
    value: function getTransactionInfo(txHash) {
      var _this17 = this;

      var jsonRPC = {
        jsonrpc: '1.0',
        method: 'gettransaction',
        params: [txHash]
      };
      var authString = Buffer.from(this.bitcoindCredentials.username + ':' + this.bitcoindCredentials.password).toString('base64');
      var headers = { Authorization: 'Basic ' + authString };
      return fetch(this.bitcoindUrl, {
        method: 'POST',
        body: JSON.stringify(jsonRPC),
        headers: headers
      }).then(function (resp) {
        return resp.json();
      }).then(function (respObj) {
        return respObj.result;
      }).then(function (txInfo) {
        return txInfo.blockhash;
      }).then(function (blockhash) {
        var jsonRPCBlock = {
          jsonrpc: '1.0',
          method: 'getblockheader',
          params: [blockhash]
        };
        headers.Authorization = 'Basic ' + authString;
        return fetch(_this17.bitcoindUrl, {
          method: 'POST',
          body: JSON.stringify(jsonRPCBlock),
          headers: headers
        });
      }).then(function (resp) {
        return resp.json();
      }).then(function (respObj) {
        if (!respObj || !respObj.result) {
          // unconfirmed 
          throw new Error('Unconfirmed transaction');
        } else {
          return { block_height: respObj.result.height };
        }
      });
    }
  }, {
    key: 'getNetworkedUTXOs',
    value: function getNetworkedUTXOs(address) {
      var _this18 = this;

      var jsonRPCImport = {
        jsonrpc: '1.0',
        method: 'importaddress',
        params: [address]
      };
      var jsonRPCUnspent = {
        jsonrpc: '1.0',
        method: 'listunspent',
        params: [0, 9999999, [address]]
      };
      var authString = Buffer.from(this.bitcoindCredentials.username + ':' + this.bitcoindCredentials.password).toString('base64');
      var headers = { Authorization: 'Basic ' + authString };

      var importPromise = this.importedBefore[address] ? Promise.resolve() : fetch(this.bitcoindUrl, {
        method: 'POST',
        body: JSON.stringify(jsonRPCImport),
        headers: headers
      }).then(function () {
        _this18.importedBefore[address] = true;
      });

      return importPromise.then(function () {
        return fetch(_this18.bitcoindUrl, {
          method: 'POST',
          body: JSON.stringify(jsonRPCUnspent),
          headers: headers
        });
      }).then(function (resp) {
        return resp.json();
      }).then(function (x) {
        return x.result;
      }).then(function (utxos) {
        return utxos.map(function (x) {
          return Object({
            value: Math.round(x.amount * SATOSHIS_PER_BTC),
            confirmations: x.confirmations,
            tx_hash: x.txid,
            tx_output_n: x.vout
          });
        });
      });
    }
  }]);

  return BitcoindAPI;
}(BitcoinNetwork);

var InsightClient = exports.InsightClient = function (_BitcoinNetwork2) {
  _inherits(InsightClient, _BitcoinNetwork2);

  function InsightClient() {
    var insightUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'https://utxo.technofractal.com/';

    _classCallCheck(this, InsightClient);

    var _this19 = _possibleConstructorReturn(this, (InsightClient.__proto__ || Object.getPrototypeOf(InsightClient)).call(this));

    _this19.apiUrl = insightUrl;
    return _this19;
  }

  _createClass(InsightClient, [{
    key: 'broadcastTransaction',
    value: function broadcastTransaction(transaction) {
      var jsonData = { tx: transaction };
      return fetch(this.apiUrl + '/tx/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData)
      }).then(function (resp) {
        return resp.json();
      });
    }
  }, {
    key: 'getBlockHeight',
    value: function getBlockHeight() {
      return fetch(this.apiUrl + '/status').then(function (resp) {
        return resp.json();
      }).then(function (status) {
        return status.blocks;
      });
    }
  }, {
    key: 'getTransactionInfo',
    value: function getTransactionInfo(txHash) {
      var _this20 = this;

      return fetch(this.apiUrl + '/tx/' + txHash).then(function (resp) {
        return resp.json();
      }).then(function (transactionInfo) {
        if (transactionInfo.error) {
          throw new Error('Error finding transaction: ' + transactionInfo.error);
        }
        return fetch(_this20.apiUrl + '/block/' + transactionInfo.blockHash);
      }).then(function (resp) {
        return resp.json();
      }).then(function (blockInfo) {
        return { block_height: blockInfo.height };
      });
    }
  }, {
    key: 'getNetworkedUTXOs',
    value: function getNetworkedUTXOs(address) {
      return fetch(this.apiUrl + '/addr/' + address + '/utxo').then(function (resp) {
        return resp.json();
      }).then(function (utxos) {
        return utxos.map(function (x) {
          return {
            value: x.satoshis,
            confirmations: x.confirmations,
            tx_hash: x.txid,
            tx_output_n: x.vout
          };
        });
      });
    }
  }]);

  return InsightClient;
}(BitcoinNetwork);

var BlockchainInfoApi = exports.BlockchainInfoApi = function (_BitcoinNetwork3) {
  _inherits(BlockchainInfoApi, _BitcoinNetwork3);

  function BlockchainInfoApi() {
    var blockchainInfoUrl = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'https://blockchain.info';

    _classCallCheck(this, BlockchainInfoApi);

    var _this21 = _possibleConstructorReturn(this, (BlockchainInfoApi.__proto__ || Object.getPrototypeOf(BlockchainInfoApi)).call(this));

    _this21.utxoProviderUrl = blockchainInfoUrl;
    return _this21;
  }

  _createClass(BlockchainInfoApi, [{
    key: 'getBlockHeight',
    value: function getBlockHeight() {
      return fetch(this.utxoProviderUrl + '/latestblock?cors=true').then(function (resp) {
        return resp.json();
      }).then(function (blockObj) {
        return blockObj.height;
      });
    }
  }, {
    key: 'getNetworkedUTXOs',
    value: function getNetworkedUTXOs(address) {
      return fetch(this.utxoProviderUrl + '/unspent?format=json&active=' + address + '&cors=true').then(function (resp) {
        if (resp.status === 500) {
          _logger.Logger.debug('UTXO provider 500 usually means no UTXOs: returning []');
          return {
            unspent_outputs: []
          };
        } else {
          return resp.json();
        }
      }).then(function (utxoJSON) {
        return utxoJSON.unspent_outputs;
      }).then(function (utxoList) {
        return utxoList.map(function (utxo) {
          var utxoOut = {
            value: utxo.value,
            tx_output_n: utxo.tx_output_n,
            confirmations: utxo.confirmations,
            tx_hash: utxo.tx_hash_big_endian
          };
          return utxoOut;
        });
      });
    }
  }, {
    key: 'getTransactionInfo',
    value: function getTransactionInfo(txHash) {
      return fetch(this.utxoProviderUrl + '/rawtx/' + txHash + '?cors=true').then(function (resp) {
        if (resp.status === 200) {
          return resp.json();
        } else {
          throw new Error('Could not lookup transaction info for \'' + txHash + '\'. Server error.');
        }
      }).then(function (respObj) {
        return { block_height: respObj.block_height };
      });
    }
  }, {
    key: 'broadcastTransaction',
    value: function broadcastTransaction(transaction) {
      var form = new _formData2.default();
      form.append('tx', transaction);
      return fetch(this.utxoProviderUrl + '/pushtx?cors=true', {
        method: 'POST',
        body: form
      }).then(function (resp) {
        var text = resp.text();
        return text.then(function (respText) {
          if (respText.toLowerCase().indexOf('transaction submitted') >= 0) {
            var txHash = _bitcoinjsLib2.default.Transaction.fromHex(transaction).getHash().reverse().toString('hex'); // big_endian
            return txHash;
          } else {
            throw new _errors.RemoteServiceError(resp, 'Broadcast transaction failed with message: ' + respText);
          }
        });
      });
    }
  }]);

  return BlockchainInfoApi;
}(BitcoinNetwork);

var LOCAL_REGTEST = new LocalRegtest('http://localhost:16268', 'http://localhost:16269', new BitcoindAPI('http://localhost:18332/', { username: 'blockstack', password: 'blockstacksystem' }));

var MAINNET_DEFAULT = new BlockstackNetwork('https://core.blockstack.org', 'https://broadcast.blockstack.org', new BlockchainInfoApi());

var network = exports.network = {
  BlockstackNetwork: BlockstackNetwork,
  LocalRegtest: LocalRegtest,
  BlockchainInfoApi: BlockchainInfoApi,
  BitcoindAPI: BitcoindAPI,
  InsightClient: InsightClient,
  defaults: { LOCAL_REGTEST: LOCAL_REGTEST, MAINNET_DEFAULT: MAINNET_DEFAULT }
};
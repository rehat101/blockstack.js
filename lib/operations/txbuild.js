'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transactions = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _bitcoinjsLib = require('bitcoinjs-lib');

var _bitcoinjsLib2 = _interopRequireDefault(_bitcoinjsLib);

var _bigi = require('bigi');

var _bigi2 = _interopRequireDefault(_bigi);

var _utils = require('./utils');

var _skeletons = require('./skeletons');

var _config = require('../config');

var _errors = require('../errors');

var _signers = require('./signers');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var dummyConsensusHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
var dummyZonefileHash = 'ffffffffffffffffffffffffffffffffffffffff';

function addOwnerInput(utxos, ownerAddress, txB) {
  var addChangeOut = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

  // add an owner UTXO and a change out.
  if (utxos.length <= 0) {
    throw new Error('Owner has no UTXOs for UPDATE.');
  }

  utxos.sort(function (a, b) {
    return a.value - b.value;
  });
  var ownerUTXO = utxos[0];
  var ownerInput = txB.addInput(ownerUTXO.tx_hash, ownerUTXO.tx_output_n);
  if (addChangeOut) {
    txB.addOutput(ownerAddress, ownerUTXO.value);
  }
  return { index: ownerInput, value: ownerUTXO.value };
}

function fundTransaction(txB, paymentAddress, utxos, feeRate, inAmounts) {
  var changeIndex = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : null;

  // change index for the payer.
  if (changeIndex === null) {
    changeIndex = txB.addOutput(paymentAddress, _utils.DUST_MINIMUM);
  }
  // fund the transaction fee.
  var txFee = (0, _utils.estimateTXBytes)(txB, 0, 0) * feeRate;
  var outAmounts = (0, _utils.sumOutputValues)(txB);
  var change = (0, _utils.addUTXOsToFund)(txB, utxos, txFee + outAmounts - inAmounts, feeRate);
  txB.__tx.outs[changeIndex].value += change;
  return txB;
}

function returnTransactionHex(txB) {
  var buildIncomplete = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

  if (buildIncomplete) {
    return txB.buildIncomplete().toHex();
  } else {
    return txB.build().toHex();
  }
}

function getTransactionSigner(input) {
  if (typeof input === 'string') {
    return _signers.PubkeyHashSigner.fromHexString(input);
  } else {
    return input;
  }
}

/**
 * Estimates cost of a preorder transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to preorder
 * @param {String} destinationAddress - the address to receive the name (this
 *    must be passed as the 'registrationAddress' in the register transaction)
 * @param {String} paymentAddress - the address funding the preorder
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the preorder. This includes a 5500 satoshi dust output for the preorder.
 *    Even though this is a change output, the payer must supply enough funds
 *    to generate this output, so we include it in the cost.
 * @private
 */
function estimatePreorder(fullyQualifiedName, destinationAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;
  var preorderPromise = network.getNamePrice(fullyQualifiedName).then(function (namePrice) {
    return (0, _skeletons.makePreorderSkeleton)(fullyQualifiedName, dummyConsensusHash, paymentAddress, network.getDefaultBurnAddress(), namePrice, destinationAddress);
  });

  return Promise.all([network.getFeeRate(), preorderPromise]).then(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 2),
        feeRate = _ref2[0],
        preorderTX = _ref2[1];

    var outputsValue = (0, _utils.sumOutputValues)(preorderTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(preorderTX, paymentUtxos, 0);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of a register transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to register
 * @param {String} registerAddress - the address to receive the name
 * @param {String} paymentAddress - the address funding the register
 * @param {Boolean} includingZonefile - whether or not we will broadcast
 *    a zonefile hash as part  of the register
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the register.
 * @private
 */
function estimateRegister(fullyQualifiedName, registerAddress, paymentAddress) {
  var includingZonefile = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
  var paymentUtxos = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;

  var network = _config.config.network;

  var valueHash = void 0;
  if (includingZonefile) {
    valueHash = dummyZonefileHash;
  }

  var registerTX = (0, _skeletons.makeRegisterSkeleton)(fullyQualifiedName, registerAddress, valueHash);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(registerTX);
    // 1 additional output for payer change
    var txFee = feeRate * (0, _utils.estimateTXBytes)(registerTX, paymentUtxos, 1);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of an update transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to update
 * @param {String} ownerAddress - the owner of the name
 * @param {String} paymentAddress - the address funding the update
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the update.
 * @private
 */
function estimateUpdate(fullyQualifiedName, ownerAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;

  var updateTX = (0, _skeletons.makeUpdateSkeleton)(fullyQualifiedName, dummyConsensusHash, dummyZonefileHash);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(updateTX);
    // 1 additional input for the owner
    // 2 additional outputs for owner / payer change
    var txFee = feeRate * (0, _utils.estimateTXBytes)(updateTX, 1 + paymentUtxos, 2);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of an transfer transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to transfer
 * @param {String} destinationAddress - the next owner of the name
 * @param {String} ownerAddress - the current owner of the name
 * @param {String} paymentAddress - the address funding the transfer
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the transfer.
 * @private
 */
function estimateTransfer(fullyQualifiedName, destinationAddress, ownerAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;

  var network = _config.config.network;

  var transferTX = (0, _skeletons.makeTransferSkeleton)(fullyQualifiedName, dummyConsensusHash, destinationAddress);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(transferTX);
    // 1 additional input for the owner
    // 2 additional outputs for owner / payer change
    var txFee = feeRate * (0, _utils.estimateTXBytes)(transferTX, 1 + paymentUtxos, 2);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of an transfer transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to renew
 * @param {String} destinationAddress - the next owner of the name
 * @param {String} ownerAddress - the current owner of the name
 * @param {String} paymentAddress - the address funding the transfer
 * @param {Boolean} includingZonefile - whether or not we will broadcast a zonefile hash
      in the renewal operation
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the transfer.
 * @private
 */
function estimateRenewal(fullyQualifiedName, destinationAddress, ownerAddress, paymentAddress) {
  var includingZonefile = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
  var paymentUtxos = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 1;

  var network = _config.config.network;

  var valueHash = void 0;
  if (includingZonefile) {
    valueHash = dummyZonefileHash;
  }

  var renewalPromise = network.getNamePrice(fullyQualifiedName).then(function (namePrice) {
    return (0, _skeletons.makeRenewalSkeleton)(fullyQualifiedName, destinationAddress, ownerAddress, network.getDefaultBurnAddress(), namePrice, valueHash);
  });

  return Promise.all([network.getFeeRate(), renewalPromise]).then(function (_ref3) {
    var _ref4 = _slicedToArray(_ref3, 2),
        feeRate = _ref4[0],
        renewalTX = _ref4[1];

    var outputsValue = (0, _utils.sumOutputValues)(renewalTX);
    // 1 additional input for the owner
    // and renewal skeleton includes all outputs for owner change, but not for payer change.
    var txFee = feeRate * (0, _utils.estimateTXBytes)(renewalTX, 1 + paymentUtxos, 1);
    return txFee + outputsValue - 5500; // don't count the dust change for old owner.
  });
}

/**
 * Estimates cost of a revoke transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to revoke
 * @param {String} ownerAddress - the current owner of the name
 * @param {String} paymentAddress  the address funding the revoke
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund the
 *    revoke.
 * @private
 */
function estimateRevoke(fullyQualifiedName, ownerAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;
  var revokeTX = (0, _skeletons.makeRevokeSkeleton)(fullyQualifiedName);

  return Promise.all([network.getFeeRate()]).then(function (_ref5) {
    var _ref6 = _slicedToArray(_ref5, 1),
        feeRate = _ref6[0];

    var outputsValue = (0, _utils.sumOutputValues)(revokeTX);
    // 1 additional input for owner
    // 1 additional output for payer change
    var txFee = feeRate * (0, _utils.estimateTXBytes)(revokeTX, 1 + paymentUtxos, 2);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of a namespace preorder transaction for a namespace
 * @param {String} namespaceID - the namespace to preorder
 * @param {String} revealAddress - the address to receive the namespace (this
 *    must be passed as the 'revealAddress' in the namespace-reveal transaction)
 * @param {String} paymentAddress - the address funding the preorder
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address.
 * @returns {Promise} - a promise which resolves to the satoshi cost to fund
 *    the preorder. This includes a 5500 satoshi dust output for the preorder.
 *    Even though this is a change output, the payer must supply enough funds
 *    to generate this output, so we include it in the cost.
 * @private
 */
function estimateNamespacePreorder(namespaceID, revealAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;

  var preorderPromise = network.getNamespacePrice(namespaceID).then(function (namespacePrice) {
    return (0, _skeletons.makeNamespacePreorderSkeleton)(namespaceID, dummyConsensusHash, paymentAddress, revealAddress, namespacePrice);
  });

  return Promise.all([network.getFeeRate(), preorderPromise]).then(function (_ref7) {
    var _ref8 = _slicedToArray(_ref7, 2),
        feeRate = _ref8[0],
        preorderTX = _ref8[1];

    var outputsValue = (0, _utils.sumOutputValues)(preorderTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(preorderTX, paymentUtxos, 0);
    return txFee + outputsValue;
  });
}

/**
 * Estimates cost of a namesapce reveal transaction for a namespace
 * @param {BlockstackNamespace} namespace - the namespace to reveal
 * @param {String} revealAddress - the address to receive the namespace
 *    (this must have been passed as 'revealAddress' to a prior namespace
 *    preorder)
 * @param {String} paymentAddress - the address that pays for this transaction
 * @param {Number} paymentUtxos - the number of UTXOs we expect will be required
 *    from the payment address
 * @returns {Promise} - a promise which resolves to the satoshi cost to
 *    fund the reveal.  This includes a 5500 satoshi dust output for the
 *    preorder.  Even though this is a change output, the payer must have
 *    enough funds to generate this output, so we include it in the cost.
 * @private
 */
function estimateNamespaceReveal(namespace, revealAddress, paymentAddress) {
  var paymentUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;
  var revealTX = (0, _skeletons.makeNamespaceRevealSkeleton)(namespace, revealAddress);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(revealTX);
    // 1 additional output for payer change
    var txFee = feeRate * (0, _utils.estimateTXBytes)(revealTX, paymentUtxos, 1);
    return txFee + outputsValue;
  });
}

/**
 * Estimates the cost of a namespace-ready transaction for a namespace
 * @param {String} namespaceID - the namespace to ready
 * @param {Number} revealUtxos - the number of UTXOs we expect will
 *  be required from the reveal address
 * @returns {Promise} - a promise which resolves to the satoshi cost to
 *  fund this namespacey-ready transaction.
 * @private
 */
function estimateNamespaceReady(namespaceID) {
  var revealUtxos = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

  var network = _config.config.network;
  var readyTX = (0, _skeletons.makeNamespaceReadySkeleton)(namespaceID);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(readyTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(readyTX, revealUtxos, 1);
    return txFee + outputsValue;
  });
}

/**
 * Estimates the cost of a name-import transaction
 * @param {String} name - the fully-qualified name
 * @param {String} recipientAddr - the recipient
 * @param {String} zonefileHash - the zone file hash
 * @param {Number} importUtxos - the number of UTXOs we expect will
 *  be required from the importer address
 * @returns {Promise} - a promise which resolves to the satoshi cost
 *  to fund this name-import transaction
 * @private
 */
function estimateNameImport(name, recipientAddr, zonefileHash) {
  var importUtxos = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;

  var network = _config.config.network;
  var importTX = (0, _skeletons.makeNameImportSkeleton)(name, recipientAddr, zonefileHash);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(importTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(importTX, importUtxos, 1);
    return txFee + outputsValue;
  });
}

/**
 * Estimates the cost of an announce transaction
 * @param {String} messageHash - the hash of the message
 * @param {Number} senderUtxos - the number of utxos we expect will
 *  be required from the importer address
 * @returns {Promise} - a promise which resolves to the satoshi cost
 *  to fund this announce transaction
 * @private
 */
function estimateAnnounce(messageHash) {
  var senderUtxos = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;

  var network = _config.config.network;
  var announceTX = (0, _skeletons.makeAnnounceSkeleton)(messageHash);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(announceTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(announceTX, senderUtxos, 1);
    return txFee + outputsValue;
  });
}

/**
 * Estimates the cost of a token-transfer transaction
 * @param {String} recipientAddress - the recipient of the tokens
 * @param {String} tokenType - the type of token to spend
 * @param {Object} tokenAmount - a 64-bit unsigned BigInteger encoding the number of tokens
 *   to spend
 * @param {String} scratchArea - an arbitrary string to store with the transaction
 * @param {Number} senderUtxos - the number of utxos we expect will
 *  be required from the importer address
 * @param {Number} additionalOutputs - the number of outputs we expect to add beyond
 *  just the recipient output (default = 1, if the token owner is also the bitcoin funder)
 * @returns {Promise} - a promise which resolves to the satoshi cost to
 *  fund this token-transfer transaction
 * @private
 */
function estimateTokenTransfer(recipientAddress, tokenType, tokenAmount, scratchArea) {
  var senderUtxos = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 1;
  var additionalOutputs = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 1;

  var network = _config.config.network;
  var tokenTransferTX = (0, _skeletons.makeTokenTransferSkeleton)(recipientAddress, dummyConsensusHash, tokenType, tokenAmount, scratchArea);

  return network.getFeeRate().then(function (feeRate) {
    var outputsValue = (0, _utils.sumOutputValues)(tokenTransferTX);
    var txFee = feeRate * (0, _utils.estimateTXBytes)(tokenTransferTX, senderUtxos, additionalOutputs);
    return txFee + outputsValue;
  });
}

/**
 * Generates a preorder transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to pre-order
 * @param {String} destinationAddress - the address to receive the name (this
 *    must be passed as the 'registrationAddress' in the register transaction)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key used to fund the transaction or a transaction signer object
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 * indicating whether the function should attempt to return an unsigned (or not fully signed)
 * transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makePreorder(fullyQualifiedName, destinationAddress, paymentKeyIn) {
  var buildIncomplete = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  var network = _config.config.network;

  var namespace = fullyQualifiedName.split('.').pop();

  var paymentKey = getTransactionSigner(paymentKeyIn);

  return paymentKey.getAddress().then(function (preorderAddress) {
    var preorderPromise = Promise.all([network.getConsensusHash(), network.getNamePrice(fullyQualifiedName), network.getNamespaceBurnAddress(namespace)]).then(function (_ref9) {
      var _ref10 = _slicedToArray(_ref9, 3),
          consensusHash = _ref10[0],
          namePrice = _ref10[1],
          burnAddress = _ref10[2];

      return (0, _skeletons.makePreorderSkeleton)(fullyQualifiedName, consensusHash, preorderAddress, burnAddress, namePrice, destinationAddress);
    });

    return Promise.all([network.getUTXOs(preorderAddress), network.getFeeRate(), preorderPromise]).then(function (_ref11) {
      var _ref12 = _slicedToArray(_ref11, 3),
          utxos = _ref12[0],
          feeRate = _ref12[1],
          preorderSkeleton = _ref12[2];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(preorderSkeleton, network.layer1);
      txB.setVersion(1);

      var changeIndex = 1; // preorder skeleton always creates a change output at index = 1
      var signingTxB = fundTransaction(txB, preorderAddress, utxos, feeRate, 0, changeIndex);

      return (0, _utils.signInputs)(signingTxB, paymentKey);
    }).then(function (signingTxB) {
      return returnTransactionHex(signingTxB, buildIncomplete);
    });
  });
}

/**
 * Generates an update transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to update
 * @param {String | TransactionSigner} ownerKeyIn - a hex string of the
 *    owner key, or a transaction signer object. This will provide one
 *    UTXO input, and also recieve a dust output.
 * @param {String | TransactionSigner} paymentKeyIn - a hex string, or a
 *    transaction signer object, of the private key used to fund the
 *    transaction's txfees
 * @param {String} zonefile - the zonefile data to update (this will be hashed
 *    to include in the transaction), the zonefile itself must be published
 *    after the UPDATE propagates.
 * @param {String} valueHash - if given, this is the hash to store (instead of
 *    zonefile).  zonefile will be ignored if this is given.
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *    indicating whether the function should attempt to return an unsigned (or not fully signed)
 *    transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeUpdate(fullyQualifiedName, ownerKeyIn, paymentKeyIn, zonefile) {
  var valueHash = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : '';
  var buildIncomplete = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;

  var network = _config.config.network;
  if (!valueHash && !zonefile) {
    return Promise.reject(new Error('Need zonefile or valueHash arguments'));
  }
  if (valueHash.length === 0) {
    if (!zonefile) {
      return Promise.reject(new Error('Need zonefile or valueHash arguments'));
    }
    valueHash = (0, _utils.hash160)(Buffer.from(zonefile)).toString('hex');
  } else if (valueHash.length !== 40) {
    return Promise.reject(new Error('Invalid valueHash ' + valueHash));
  }

  var paymentKey = getTransactionSigner(paymentKeyIn);
  var ownerKey = getTransactionSigner(ownerKeyIn);

  return Promise.all([ownerKey.getAddress(), paymentKey.getAddress()]).then(function (_ref13) {
    var _ref14 = _slicedToArray(_ref13, 2),
        ownerAddress = _ref14[0],
        paymentAddress = _ref14[1];

    var txPromise = network.getConsensusHash().then(function (consensusHash) {
      return (0, _skeletons.makeUpdateSkeleton)(fullyQualifiedName, consensusHash, valueHash);
    }).then(function (updateTX) {
      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(updateTX, network.layer1);
      txB.setVersion(1);
      return txB;
    });

    return Promise.all([txPromise, network.getUTXOs(paymentAddress), network.getUTXOs(ownerAddress), network.getFeeRate()]).then(function (_ref15) {
      var _ref16 = _slicedToArray(_ref15, 4),
          txB = _ref16[0],
          payerUtxos = _ref16[1],
          ownerUtxos = _ref16[2],
          feeRate = _ref16[3];

      var ownerInput = addOwnerInput(ownerUtxos, ownerAddress, txB);
      var signingTxB = fundTransaction(txB, paymentAddress, payerUtxos, feeRate, ownerInput.value);

      return (0, _utils.signInputs)(signingTxB, paymentKey, [{ index: ownerInput.index, signer: ownerKey }]);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a register transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to register
 * @param {String} registerAddress - the address to receive the name (this
 *    must have been passed as the 'destinationAddress' in the preorder transaction)
 *    this address will receive a dust UTXO
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key (or a TransactionSigner object) used to fund the
 *    transaction (this *must* be the same as the payment address used
 *    to fund the preorder)
 * @param {String} zonefile - the zonefile data to include (this will be hashed
 *    to include in the transaction), the zonefile itself must be published
 *    after the UPDATE propagates.
 * @param {String} valueHash - the hash of the zone file data to include.
 *    It will be used instead of zonefile, if given
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *    indicating whether the function should attempt to return an unsigned (or not fully signed)
 *    transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeRegister(fullyQualifiedName, registerAddress, paymentKeyIn) {
  var zonefile = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
  var valueHash = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
  var buildIncomplete = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;

  var network = _config.config.network;
  if (!valueHash && !!zonefile) {
    valueHash = (0, _utils.hash160)(Buffer.from(zonefile)).toString('hex');
  } else if (!!valueHash && valueHash.length !== 40) {
    return Promise.reject(new Error('Invalid zonefile hash ' + valueHash));
  }

  var registerSkeleton = (0, _skeletons.makeRegisterSkeleton)(fullyQualifiedName, registerAddress, valueHash);

  var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(registerSkeleton, network.layer1);
  txB.setVersion(1);

  var paymentKey = getTransactionSigner(paymentKeyIn);

  return paymentKey.getAddress().then(function (paymentAddress) {
    return Promise.all([network.getUTXOs(paymentAddress), network.getFeeRate()]).then(function (_ref17) {
      var _ref18 = _slicedToArray(_ref17, 2),
          utxos = _ref18[0],
          feeRate = _ref18[1];

      var signingTxB = fundTransaction(txB, paymentAddress, utxos, feeRate, 0);

      return (0, _utils.signInputs)(signingTxB, paymentKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a transfer transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to transfer
 * @param {String} destinationAddress - the address to receive the name.
 *    this address will receive a dust UTXO
 * @param {String | TransactionSigner} ownerKeyIn - a hex string of
 *    the current owner's private key (or a TransactionSigner object)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key used to fund the transaction (or a
 *    TransactionSigner object)
 * @param {Boolean} keepZonefile - if true, then preserve the name's zone file
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *   indicating whether the function should attempt to return an unsigned (or not fully signed)
 *   transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeTransfer(fullyQualifiedName, destinationAddress, ownerKeyIn, paymentKeyIn) {
  var keepZonefile = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
  var buildIncomplete = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;

  var network = _config.config.network;

  var paymentKey = getTransactionSigner(paymentKeyIn);
  var ownerKey = getTransactionSigner(ownerKeyIn);

  return Promise.all([ownerKey.getAddress(), paymentKey.getAddress()]).then(function (_ref19) {
    var _ref20 = _slicedToArray(_ref19, 2),
        ownerAddress = _ref20[0],
        paymentAddress = _ref20[1];

    var txPromise = network.getConsensusHash().then(function (consensusHash) {
      return (0, _skeletons.makeTransferSkeleton)(fullyQualifiedName, consensusHash, destinationAddress, keepZonefile);
    }).then(function (transferTX) {
      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(transferTX, network.layer1);
      txB.setVersion(1);
      return txB;
    });

    return Promise.all([txPromise, network.getUTXOs(paymentAddress), network.getUTXOs(ownerAddress), network.getFeeRate()]).then(function (_ref21) {
      var _ref22 = _slicedToArray(_ref21, 4),
          txB = _ref22[0],
          payerUtxos = _ref22[1],
          ownerUtxos = _ref22[2],
          feeRate = _ref22[3];

      var ownerInput = addOwnerInput(ownerUtxos, ownerAddress, txB);
      var signingTxB = fundTransaction(txB, paymentAddress, payerUtxos, feeRate, ownerInput.value);

      return (0, _utils.signInputs)(signingTxB, paymentKey, [{ index: ownerInput.index, signer: ownerKey }]);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a revoke transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to revoke
 * @param {String | TransactionSigner} ownerKeyIn - a hex string of
 *    the current owner's private key (or a TransactionSigner object)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key used to fund the transaction (or a
 *    TransactionSigner object)
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *    indicating whether the function should attempt to return an unsigned (or not fully signed)
 *    transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeRevoke(fullyQualifiedName, ownerKeyIn, paymentKeyIn) {
  var buildIncomplete = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  var network = _config.config.network;

  var paymentKey = getTransactionSigner(paymentKeyIn);
  var ownerKey = getTransactionSigner(ownerKeyIn);

  return Promise.all([ownerKey.getAddress(), paymentKey.getAddress()]).then(function (_ref23) {
    var _ref24 = _slicedToArray(_ref23, 2),
        ownerAddress = _ref24[0],
        paymentAddress = _ref24[1];

    var revokeTX = (0, _skeletons.makeRevokeSkeleton)(fullyQualifiedName);
    var txPromise = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(revokeTX, network.layer1);
    txPromise.setVersion(1);

    return Promise.all([txPromise, network.getUTXOs(paymentAddress), network.getUTXOs(ownerAddress), network.getFeeRate()]).then(function (_ref25) {
      var _ref26 = _slicedToArray(_ref25, 4),
          txB = _ref26[0],
          payerUtxos = _ref26[1],
          ownerUtxos = _ref26[2],
          feeRate = _ref26[3];

      var ownerInput = addOwnerInput(ownerUtxos, ownerAddress, txB);
      var signingTxB = fundTransaction(txB, paymentAddress, payerUtxos, feeRate, ownerInput.value);
      return (0, _utils.signInputs)(signingTxB, paymentKey, [{ index: ownerInput.index, signer: ownerKey }]);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a renewal transaction for a domain name.
 * @param {String} fullyQualifiedName - the name to transfer
 * @param {String} destinationAddress - the address to receive the name after renewal
 *    this address will receive a dust UTXO
 * @param {String | TransactionSigner} ownerKeyIn - a hex string of
 *    the current owner's private key (or a TransactionSigner object)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key used to fund the renewal (or a TransactionSigner
 *    object)
 * @param {String} zonefile - the zonefile data to include, if given (this will be hashed
 *    to include in the transaction), the zonefile itself must be published
 *    after the RENEWAL propagates.
 * @param {String} valueHash - the raw zone file hash to include (this will be used
 *    instead of zonefile, if given).
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *    indicating whether the function should attempt to return an unsigned (or not fully signed)
 *    transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeRenewal(fullyQualifiedName, destinationAddress, ownerKeyIn, paymentKeyIn) {
  var zonefile = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
  var valueHash = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : null;
  var buildIncomplete = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : false;

  var network = _config.config.network;

  if (!valueHash && !!zonefile) {
    valueHash = (0, _utils.hash160)(Buffer.from(zonefile)).toString('hex');
  }

  var namespace = fullyQualifiedName.split('.').pop();

  var paymentKey = getTransactionSigner(paymentKeyIn);
  var ownerKey = getTransactionSigner(ownerKeyIn);

  return Promise.all([ownerKey.getAddress(), paymentKey.getAddress()]).then(function (_ref27) {
    var _ref28 = _slicedToArray(_ref27, 2),
        ownerAddress = _ref28[0],
        paymentAddress = _ref28[1];

    var txPromise = Promise.all([network.getNamePrice(fullyQualifiedName), network.getNamespaceBurnAddress(namespace)]).then(function (_ref29) {
      var _ref30 = _slicedToArray(_ref29, 2),
          namePrice = _ref30[0],
          burnAddress = _ref30[1];

      return (0, _skeletons.makeRenewalSkeleton)(fullyQualifiedName, destinationAddress, ownerAddress, burnAddress, namePrice, valueHash);
    }).then(function (tx) {
      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(tx, network.layer1);
      txB.setVersion(1);
      return txB;
    });

    return Promise.all([txPromise, network.getUTXOs(paymentAddress), network.getUTXOs(ownerAddress), network.getFeeRate()]).then(function (_ref31) {
      var _ref32 = _slicedToArray(_ref31, 4),
          txB = _ref32[0],
          payerUtxos = _ref32[1],
          ownerUtxos = _ref32[2],
          feeRate = _ref32[3];

      var ownerInput = addOwnerInput(ownerUtxos, ownerAddress, txB, false);
      var ownerOutput = txB.__tx.outs[2];
      var ownerOutputAddr = _bitcoinjsLib2.default.address.fromOutputScript(ownerOutput.script, network.layer1);
      if (ownerOutputAddr !== ownerAddress) {
        return Promise.reject(new Error('Original owner ' + ownerAddress + ' should have an output at ' + ('index 2 in transaction was ' + ownerOutputAddr)));
      }
      ownerOutput.value = ownerInput.value;
      var signingTxB = fundTransaction(txB, paymentAddress, payerUtxos, feeRate, ownerInput.value);
      return (0, _utils.signInputs)(signingTxB, paymentKey, [{ index: ownerInput.index, signer: ownerKey }]);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a namespace preorder transaction for a namespace
 * @param {String} namespaceID - the namespace to pre-order
 * @param {String} revealAddress - the address to receive the namespace (this
 *    must be passed as the 'revealAddress' in the namespace-reveal transaction)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string of
 *    the private key used to fund the transaction (or a
 *    TransactionSigner object)
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *    indicating whether the function should attempt to return an unsigned (or not fully signed)
 *    transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *    this function *does not* perform the requisite safety checks -- please see
 *    the safety module for those.
 * @private
 */
function makeNamespacePreorder(namespaceID, revealAddress, paymentKeyIn) {
  var buildIncomplete = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  var network = _config.config.network;

  var paymentKey = getTransactionSigner(paymentKeyIn);

  return paymentKey.getAddress().then(function (preorderAddress) {
    var preorderPromise = Promise.all([network.getConsensusHash(), network.getNamespacePrice(namespaceID)]).then(function (_ref33) {
      var _ref34 = _slicedToArray(_ref33, 2),
          consensusHash = _ref34[0],
          namespacePrice = _ref34[1];

      return (0, _skeletons.makeNamespacePreorderSkeleton)(namespaceID, consensusHash, preorderAddress, revealAddress, namespacePrice);
    });

    return Promise.all([network.getUTXOs(preorderAddress), network.getFeeRate(), preorderPromise]).then(function (_ref35) {
      var _ref36 = _slicedToArray(_ref35, 3),
          utxos = _ref36[0],
          feeRate = _ref36[1],
          preorderSkeleton = _ref36[2];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(preorderSkeleton, network.layer1);
      txB.setVersion(1);

      var changeIndex = 1; // preorder skeleton always creates a change output at index = 1
      var signingTxB = fundTransaction(txB, preorderAddress, utxos, feeRate, 0, changeIndex);

      return (0, _utils.signInputs)(signingTxB, paymentKey);
    }).then(function (signingTxB) {
      return returnTransactionHex(signingTxB, buildIncomplete);
    });
  });
}

/**
 * Generates a namespace reveal transaction for a namespace
 * @param {BlockstackNamespace} namespace - the namespace to reveal
 * @param {String} revealAddress - the address to receive the namespace (this
 *   must be passed as the 'revealAddress' in the namespace-reveal transaction)
 * @param {String | TransactionSigner} paymentKeyIn - a hex string (or
 *   a TransactionSigner object) of the private key used to fund the
 *   transaction
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *   indicating whether the function should attempt to return an unsigned (or not fully signed)
 *   transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *   this function *does not* perform the requisite safety checks -- please see
 *   the safety module for those.
 * @private
 */
function makeNamespaceReveal(namespace, revealAddress, paymentKeyIn) {
  var buildIncomplete = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  var network = _config.config.network;

  if (!namespace.check()) {
    return Promise.reject(new Error('Invalid namespace'));
  }

  var namespaceRevealTX = (0, _skeletons.makeNamespaceRevealSkeleton)(namespace, revealAddress);

  var paymentKey = getTransactionSigner(paymentKeyIn);

  return paymentKey.getAddress().then(function (preorderAddress) {
    return Promise.all([network.getUTXOs(preorderAddress), network.getFeeRate()]).then(function (_ref37) {
      var _ref38 = _slicedToArray(_ref37, 2),
          utxos = _ref38[0],
          feeRate = _ref38[1];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(namespaceRevealTX, network.layer1);
      txB.setVersion(1);
      var signingTxB = fundTransaction(txB, preorderAddress, utxos, feeRate, 0);

      return (0, _utils.signInputs)(signingTxB, paymentKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a namespace ready transaction for a namespace
 * @param {String} namespaceID - the namespace to launch
 * @param {String | TransactionSigner} revealKeyIn - the private key
 *  of the 'revealAddress' used to reveal the namespace
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *  indicating whether the function should attempt to return an unsigned (or not fully signed)
 *  transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 *  this function *does not* perform the requisite safety checks -- please see
 *  the safety module for those.
 * @private
 */
function makeNamespaceReady(namespaceID, revealKeyIn) {
  var buildIncomplete = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  var network = _config.config.network;

  var namespaceReadyTX = (0, _skeletons.makeNamespaceReadySkeleton)(namespaceID);

  var revealKey = getTransactionSigner(revealKeyIn);

  return revealKey.getAddress().then(function (revealAddress) {
    return Promise.all([network.getUTXOs(revealAddress), network.getFeeRate()]).then(function (_ref39) {
      var _ref40 = _slicedToArray(_ref39, 2),
          utxos = _ref40[0],
          feeRate = _ref40[1];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(namespaceReadyTX, network.layer1);
      txB.setVersion(1);
      var signingTxB = fundTransaction(txB, revealAddress, utxos, feeRate, 0);
      return (0, _utils.signInputs)(signingTxB, revealKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a name import transaction for a namespace
 * @param {String} name - the name to import
 * @param {String} recipientAddr - the address to receive the name
 * @param {String} zonefileHash - the hash of the zonefile to give this name
 * @param {String | TransactionSigner} importerKeyIn - the private key
 * that pays for the import
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 * indicating whether the function should attempt to return an unsigned (or not fully signed)
 * transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 * this function does not perform the requisite safety checks -- please see
 * the safety module for those.
 * @private
 */
function makeNameImport(name, recipientAddr, zonefileHash, importerKeyIn) {
  var buildIncomplete = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

  var network = _config.config.network;

  var nameImportTX = (0, _skeletons.makeNameImportSkeleton)(name, recipientAddr, zonefileHash);

  var importerKey = getTransactionSigner(importerKeyIn);

  return importerKey.getAddress().then(function (importerAddress) {
    return Promise.all([network.getUTXOs(importerAddress), network.getFeeRate()]).then(function (_ref41) {
      var _ref42 = _slicedToArray(_ref41, 2),
          utxos = _ref42[0],
          feeRate = _ref42[1];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(nameImportTX, network.layer1);
      var signingTxB = fundTransaction(txB, importerAddress, utxos, feeRate, 0);
      return (0, _utils.signInputs)(signingTxB, importerKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates an announce transaction
 * @param {String} messageHash - the hash of the message to send.  Should be
 *  an already-announced zone file hash
 * @param {String | TransactionSigner} senderKeyIn - the private key
 *  that pays for the transaction.  Should be the key that owns the
 *  name that the message recipients subscribe to
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 * indicating whether the function should attempt to return an unsigned (or not fully signed)
 * transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 * this function does not perform the requisite safety checks -- please see the
 * safety module for those.
 * @private
 */
function makeAnnounce(messageHash, senderKeyIn) {
  var buildIncomplete = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

  var network = _config.config.network;

  var announceTX = (0, _skeletons.makeAnnounceSkeleton)(messageHash);

  var senderKey = getTransactionSigner(senderKeyIn);

  return senderKey.getAddress().then(function (senderAddress) {
    return Promise.all([network.getUTXOs(senderAddress), network.getFeeRate()]).then(function (_ref43) {
      var _ref44 = _slicedToArray(_ref43, 2),
          utxos = _ref44[0],
          feeRate = _ref44[1];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(announceTX, network.layer1);
      var signingTxB = fundTransaction(txB, senderAddress, utxos, feeRate, 0);
      return (0, _utils.signInputs)(signingTxB, senderKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a token-transfer transaction
 * @param {String} recipientAddress - the address to receive the tokens
 * @param {String} tokenType - the type of tokens to send
 * @param {Object} tokenAmount - the BigInteger encoding of an unsigned 64-bit number of
 *  tokens to send
 * @param {String} scratchArea - an arbitrary string to include with the transaction
 * @param {String | TransactionSigner} senderKeyIn - the hex-encoded private key to send
 *   the tokens
 * @param {String | TransactionSigner} btcFunderKeyIn - the hex-encoded private key to fund
 *   the bitcoin fees for the transaction. Optional -- if not passed, will attempt to
 *   fund with sender key.
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 *   indicating whether the function should attempt to return an unsigned (or not fully signed)
 *   transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 * This function does not perform the requisite safety checks -- please see the
 * safety module for those.
 * @private
 */
function makeTokenTransfer(recipientAddress, tokenType, tokenAmount, scratchArea, senderKeyIn, btcFunderKeyIn) {
  var buildIncomplete = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : false;

  var network = _config.config.network;
  var separateFunder = !!btcFunderKeyIn;

  var senderKey = getTransactionSigner(senderKeyIn);
  var btcKey = btcFunderKeyIn ? getTransactionSigner(btcFunderKeyIn) : senderKey;

  var txPromise = network.getConsensusHash().then(function (consensusHash) {
    return (0, _skeletons.makeTokenTransferSkeleton)(recipientAddress, consensusHash, tokenType, tokenAmount, scratchArea);
  });

  return Promise.all([senderKey.getAddress(), btcKey.getAddress()]).then(function (_ref45) {
    var _ref46 = _slicedToArray(_ref45, 2),
        senderAddress = _ref46[0],
        btcAddress = _ref46[1];

    var btcUTXOsPromise = separateFunder ? network.getUTXOs(btcAddress) : Promise.resolve([]);
    var networkPromises = [network.getUTXOs(senderAddress), btcUTXOsPromise, network.getFeeRate(), txPromise];
    return Promise.all(networkPromises).then(function (_ref47) {
      var _ref48 = _slicedToArray(_ref47, 4),
          senderUTXOs = _ref48[0],
          btcUTXOs = _ref48[1],
          feeRate = _ref48[2],
          tokenTransferTX = _ref48[3];

      var txB = _bitcoinjsLib2.default.TransactionBuilder.fromTransaction(tokenTransferTX, network.layer1);

      if (separateFunder) {
        var payerInput = addOwnerInput(senderUTXOs, senderAddress, txB);
        var signingTxB = fundTransaction(txB, btcAddress, btcUTXOs, feeRate, payerInput.value);
        return (0, _utils.signInputs)(signingTxB, btcKey, [{ index: payerInput.index, signer: senderKey }]);
      } else {
        var _signingTxB = fundTransaction(txB, senderAddress, senderUTXOs, feeRate, 0);
        return (0, _utils.signInputs)(_signingTxB, senderKey);
      }
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

/**
 * Generates a bitcoin spend to a specified address. This will fund up to `amount`
 *   of satoshis from the payer's UTXOs. It will generate a change output if and only
 *   if the amount of leftover change is *greater* than the additional fees associated
 *   with the extra output. If the requested amount is not enough to fund the transaction's
 *   associated fees, then this will reject with a InvalidAmountError
 *
 * UTXOs are selected largest to smallest, and UTXOs which cannot fund the fees associated
 *   with their own input will not be included.
 *
 * If you specify an amount > the total balance of the payer address, then this will
 *   generate a maximum spend transaction
 *
 * @param {String} destinationAddress - the address to receive the bitcoin payment
 * @param {String | TransactionSigner} paymentKeyIn - the private key
 *    used to fund the bitcoin spend
 * @param {number} amount - the amount in satoshis for the payment address to
 *    spend in this transaction
 * @param {boolean} buildIncomplete - optional boolean, defaults to false,
 * indicating whether the function should attempt to return an unsigned (or not fully signed)
 * transaction. Useful for passing around a TX for multi-sig input signing.
 * @returns {Promise} - a promise which resolves to the hex-encoded transaction.
 * @private
 */
function makeBitcoinSpend(destinationAddress, paymentKeyIn, amount) {
  var buildIncomplete = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

  if (amount <= 0) {
    return Promise.reject(new _errors.InvalidParameterError('amount', 'amount must be greater than zero'));
  }

  var network = _config.config.network;

  var paymentKey = getTransactionSigner(paymentKeyIn);

  return paymentKey.getAddress().then(function (paymentAddress) {
    return Promise.all([network.getUTXOs(paymentAddress), network.getFeeRate()]).then(function (_ref49) {
      var _ref50 = _slicedToArray(_ref49, 2),
          utxos = _ref50[0],
          feeRate = _ref50[1];

      var txB = new _bitcoinjsLib2.default.TransactionBuilder(network.layer1);
      txB.setVersion(1);
      var destinationIndex = txB.addOutput(destinationAddress, 0);

      // will add utxos up to _amount_ and return the amount of leftover _change_
      var change = void 0;
      try {
        change = (0, _utils.addUTXOsToFund)(txB, utxos, amount, feeRate, false);
      } catch (err) {
        if (err.name === 'NotEnoughFundsError') {
          // actual amount funded = amount requested - remainder
          amount -= err.leftToFund;
          change = 0;
        } else {
          throw err;
        }
      }

      var feesToPay = feeRate * (0, _utils.estimateTXBytes)(txB, 0, 0);
      var feeForChange = feeRate * (0, _utils.estimateTXBytes)(txB, 0, 1) - feesToPay;

      // it's worthwhile to add a change output
      if (change > feeForChange) {
        feesToPay += feeForChange;
        txB.addOutput(paymentAddress, change);
      }

      // now let's compute how much output is leftover once we pay the fees.
      var outputAmount = amount - feesToPay;
      if (outputAmount < _utils.DUST_MINIMUM) {
        throw new _errors.InvalidAmountError(feesToPay, amount);
      }

      // we need to manually set the output values now
      txB.__tx.outs[destinationIndex].value = outputAmount;

      // ready to sign.
      return (0, _utils.signInputs)(txB, paymentKey);
    });
  }).then(function (signingTxB) {
    return returnTransactionHex(signingTxB, buildIncomplete);
  });
}

var transactions = exports.transactions = {
  makeRenewal: makeRenewal,
  makeUpdate: makeUpdate,
  makePreorder: makePreorder,
  makeRegister: makeRegister,
  makeTransfer: makeTransfer,
  makeRevoke: makeRevoke,
  makeNamespacePreorder: makeNamespacePreorder,
  makeNamespaceReveal: makeNamespaceReveal,
  makeNamespaceReady: makeNamespaceReady,
  makeBitcoinSpend: makeBitcoinSpend,
  makeNameImport: makeNameImport,
  makeAnnounce: makeAnnounce,
  makeTokenTransfer: makeTokenTransfer,
  BlockstackNamespace: _skeletons.BlockstackNamespace,
  estimatePreorder: estimatePreorder,
  estimateRegister: estimateRegister,
  estimateTransfer: estimateTransfer,
  estimateUpdate: estimateUpdate,
  estimateRenewal: estimateRenewal,
  estimateRevoke: estimateRevoke,
  estimateNamespacePreorder: estimateNamespacePreorder,
  estimateNamespaceReveal: estimateNamespaceReveal,
  estimateNamespaceReady: estimateNamespaceReady,
  estimateNameImport: estimateNameImport,
  estimateAnnounce: estimateAnnounce,
  estimateTokenTransfer: estimateTokenTransfer
};
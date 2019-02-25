'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BLOCKSTACK_GAIA_HUB_LABEL = exports.uploadToGaiaHub = exports.connectToGaiaHub = undefined;

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();
// export { type GaiaHubConfig } from './hub'

exports.getUserAppFileUrl = getUserAppFileUrl;
exports.encryptContent = encryptContent;
exports.decryptContent = decryptContent;
exports.getFile = getFile;
exports.putFile = putFile;
exports.getAppBucketUrl = getAppBucketUrl;
exports.deleteFile = deleteFile;
exports.listFiles = listFiles;

var _hub = require('./hub');

var _encryption = require('../encryption');

var _auth = require('../auth');

var _keys = require('../keys');

var _profiles = require('../profiles');

var _errors = require('../errors');

var _logger = require('../logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var SIGNATURE_FILE_SUFFIX = '.sig';

/**
 * Fetch the public read URL of a user file for the specified app.
 * @param {String} path - the path to the file to read
 * @param {String} username - The Blockstack ID of the user to look up
 * @param {String} appOrigin - The app origin
 * @param {String} [zoneFileLookupURL=null] - The URL
 * to use for zonefile lookup. If falsey, this will use the
 * blockstack.js's getNameInfo function instead.
 * @return {Promise} that resolves to the public read URL of the file
 * or rejects with an error
 */
function getUserAppFileUrl(path, username, appOrigin) {
  var zoneFileLookupURL = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

  return (0, _profiles.lookupProfile)(username, zoneFileLookupURL).then(function (profile) {
    if (profile.hasOwnProperty('apps')) {
      if (profile.apps.hasOwnProperty(appOrigin)) {
        return profile.apps[appOrigin];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }).then(function (bucketUrl) {
    if (bucketUrl) {
      var bucket = bucketUrl.replace(/\/?(\?|#|$)/, '/$1');
      return '' + bucket + path;
    } else {
      return null;
    }
  });
}

/**
 * Encrypts the data provided with the app public key.
 * @param {String|Buffer} content - data to encrypt
 * @param {Object} [options=null] - options object
 * @param {String} options.publicKey - the hex string of the ECDSA public
 * key to use for encryption. If not provided, will use user's appPublicKey.
 * @return {String} Stringified ciphertext object
 */
function encryptContent(content, options) {
  var defaults = { publicKey: null };
  var opt = Object.assign({}, defaults, options);
  if (!opt.publicKey) {
    var privateKey = (0, _auth.loadUserData)().appPrivateKey;
    opt.publicKey = (0, _keys.getPublicKeyFromPrivate)(privateKey);
  }

  var cipherObject = (0, _encryption.encryptECIES)(opt.publicKey, content);
  return JSON.stringify(cipherObject);
}

/**
 * Decrypts data encrypted with `encryptContent` with the
 * transit private key.
 * @param {String|Buffer} content - encrypted content.
 * @param {Object} [options=null] - options object
 * @param {String} options.privateKey - the hex string of the ECDSA private
 * key to use for decryption. If not provided, will use user's appPrivateKey.
 * @return {String|Buffer} decrypted content.
 */
function decryptContent(content, options) {
  var defaults = { privateKey: null };
  var opt = Object.assign({}, defaults, options);
  var privateKey = opt.privateKey;
  if (!privateKey) {
    privateKey = (0, _auth.loadUserData)().appPrivateKey;
  }

  try {
    var cipherObject = JSON.parse(content);
    return (0, _encryption.decryptECIES)(privateKey, cipherObject);
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error('Failed to parse encrypted content JSON. The content may not ' + 'be encrypted. If using getFile, try passing { decrypt: false }.');
    } else {
      throw err;
    }
  }
}

/* Get the gaia address used for servicing multiplayer reads for the given
 * (username, app) pair.
 * @private
 */
function getGaiaAddress(app, username, zoneFileLookupURL) {
  return Promise.resolve().then(function () {
    if (username) {
      return getUserAppFileUrl('/', username, app, zoneFileLookupURL);
    } else {
      return (0, _hub.getOrSetLocalGaiaHubConnection)().then(function (gaiaHubConfig) {
        return (0, _hub.getFullReadUrl)('/', gaiaHubConfig);
      });
    }
  }).then(function (fileUrl) {
    var matches = fileUrl.match(/([13][a-km-zA-HJ-NP-Z0-9]{26,35})/);
    if (!matches) {
      throw new Error('Failed to parse gaia address');
    }
    return matches[matches.length - 1];
  });
}

/* Handle fetching the contents from a given path. Handles both
 *  multi-player reads and reads from own storage.
 * @private
 */
function getFileContents(path, app, username, zoneFileLookupURL, forceText) {
  return Promise.resolve().then(function () {
    if (username) {
      return getUserAppFileUrl(path, username, app, zoneFileLookupURL);
    } else {
      return (0, _hub.getOrSetLocalGaiaHubConnection)().then(function (gaiaHubConfig) {
        return (0, _hub.getFullReadUrl)(path, gaiaHubConfig);
      });
    }
  }).then(function (readUrl) {
    return new Promise(function (resolve, reject) {
      if (!readUrl) {
        reject(null);
      } else {
        resolve(readUrl);
      }
    });
  }).then(function (readUrl) {
    return fetch(readUrl);
  }).then(function (response) {
    if (response.status !== 200) {
      if (response.status === 404) {
        _logger.Logger.debug('getFile ' + path + ' returned 404, returning null');
        return null;
      } else {
        throw new Error('getFile ' + path + ' failed with HTTP status ' + response.status);
      }
    }
    var contentType = response.headers.get('Content-Type');
    if (forceText || contentType === null || contentType.startsWith('text') || contentType === 'application/json') {
      return { response: response.text(), contentType: contentType };
    } else {
      return { response: response.arrayBuffer(), contentType: contentType };
    }
  });
}

/* Handle fetching an unencrypted file, its associated signature
 *  and then validate it. Handles both multi-player reads and reads
 *  from own storage.
 * @private
 */
function getFileSignedUnencrypted(path, opt) {
  // future optimization note:
  //    in the case of _multi-player_ reads, this does a lot of excess
  //    profile lookups to figure out where to read files
  //    do browsers cache all these requests if Content-Cache is set?
  return Promise.all([getFileContents(path, opt.app, opt.username, opt.zoneFileLookupURL, false), getFileContents('' + path + SIGNATURE_FILE_SUFFIX, opt.app, opt.username, opt.zoneFileLookupURL, true), getGaiaAddress(opt.app, opt.username, opt.zoneFileLookupURL)]).then(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 3),
        fileContents = _ref2[0],
        signatureContents = _ref2[1],
        gaiaAddress = _ref2[2];

    if (!fileContents) {
      return fileContents;
    }
    if (!gaiaAddress) {
      throw new _errors.SignatureVerificationError('Failed to get gaia address for verification of: ' + ('' + path));
    }
    if (!signatureContents || typeof signatureContents !== 'string') {
      throw new _errors.SignatureVerificationError('Failed to obtain signature for file: ' + (path + ' -- looked in ' + path + SIGNATURE_FILE_SUFFIX));
    }
    var signature = void 0;
    var publicKey = void 0;
    try {
      var sigObject = JSON.parse(signatureContents);
      signature = sigObject.signature;
      publicKey = sigObject.publicKey;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('Failed to parse signature content JSON ' + ('(path: ' + path + SIGNATURE_FILE_SUFFIX + ')') + ' The content may be corrupted.');
      } else {
        throw err;
      }
    }
    var signerAddress = (0, _keys.publicKeyToAddress)(publicKey);
    if (gaiaAddress !== signerAddress) {
      throw new _errors.SignatureVerificationError('Signer pubkey address (' + signerAddress + ') doesn\'t' + (' match gaia address (' + gaiaAddress + ')'));
    } else if (!(0, _encryption.verifyECDSA)(Buffer.from(fileContents), publicKey, signature)) {
      throw new _errors.SignatureVerificationError('Contents do not match ECDSA signature: ' + ('path: ' + path + ', signature: ' + path + SIGNATURE_FILE_SUFFIX));
    } else {
      return fileContents;
    }
  });
}

/* Handle signature verification and decryption for contents which are
 *  expected to be signed and encrypted. This works for single and
 *  multiplayer reads. In the case of multiplayer reads, it uses the
 *  gaia address for verification of the claimed public key.
 * @private
 */
function handleSignedEncryptedContents(path, storedContents, app, username, zoneFileLookupURL) {
  var appPrivateKey = (0, _auth.loadUserData)().appPrivateKey;
  var appPublicKey = (0, _keys.getPublicKeyFromPrivate)(appPrivateKey);

  var addressPromise = void 0;
  if (username) {
    addressPromise = getGaiaAddress(app, username, zoneFileLookupURL);
  } else {
    var address = (0, _keys.publicKeyToAddress)(appPublicKey);
    addressPromise = Promise.resolve(address);
  }

  return addressPromise.then(function (address) {
    if (!address) {
      throw new _errors.SignatureVerificationError('Failed to get gaia address for verification of: ' + ('' + path));
    }
    var sigObject = void 0;
    try {
      sigObject = JSON.parse(storedContents);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error('Failed to parse encrypted, signed content JSON. The content may not ' + 'be encrypted. If using getFile, try passing' + ' { verify: false, decrypt: false }.');
      } else {
        throw err;
      }
    }
    var signature = sigObject.signature;
    var signerPublicKey = sigObject.publicKey;
    var cipherText = sigObject.cipherText;
    var signerAddress = (0, _keys.publicKeyToAddress)(signerPublicKey);

    if (!signerPublicKey || !cipherText || !signature) {
      throw new _errors.SignatureVerificationError('Failed to get signature verification data from file:' + (' ' + path));
    } else if (signerAddress !== address) {
      throw new _errors.SignatureVerificationError('Signer pubkey address (' + signerAddress + ') doesn\'t' + (' match gaia address (' + address + ')'));
    } else if (!(0, _encryption.verifyECDSA)(cipherText, signerPublicKey, signature)) {
      throw new _errors.SignatureVerificationError('Contents do not match ECDSA signature in file:' + (' ' + path));
    } else {
      return decryptContent(cipherText);
    }
  });
}

/**
 * Retrieves the specified file from the app's data store.
 * @param {String} path - the path to the file to read
 * @param {Object} [options=null] - options object
 * @param {Boolean} [options.decrypt=true] - try to decrypt the data with the app private key
 * @param {String} options.username - the Blockstack ID to lookup for multi-player storage
 * @param {Boolean} options.verify - Whether the content should be verified, only to be used
 * when `putFile` was set to `sign = true`
 * @param {String} options.app - the app to lookup for multi-player storage -
 * defaults to current origin
 * @param {String} [options.zoneFileLookupURL=null] - The URL
 * to use for zonefile lookup. If falsey, this will use the
 * blockstack.js's getNameInfo function instead.
 * @returns {Promise} that resolves to the raw data in the file
 * or rejects with an error
 */
function getFile(path, options) {
  var _this = this;

  var defaults = {
    decrypt: true,
    verify: false,
    username: null,
    app: window.location.origin,
    zoneFileLookupURL: null
  };

  var opt = Object.assign({}, defaults, options);

  // in the case of signature verification, but no
  //  encryption expected, need to fetch _two_ files.
  if (opt.verify && !opt.decrypt) {
    return getFileSignedUnencrypted(path, opt);
  }

  return getFileContents(path, opt.app, opt.username, opt.zoneFileLookupURL, !!opt.decrypt).then(function () {
    var _ref3 = _asyncToGenerator( /*#__PURE__*/_regenerator2.default.mark(function _callee(res) {
      var storedContents, contentType;
      return _regenerator2.default.wrap(function _callee$(_context) {
        while (1) {
          switch (_context.prev = _context.next) {
            case 0:
              _context.next = 2;
              return res.response;

            case 2:
              storedContents = _context.sent;
              contentType = res.contentType;

              if (!(storedContents === null)) {
                _context.next = 8;
                break;
              }

              return _context.abrupt('return', storedContents);

            case 8:
              if (!(opt.decrypt && !opt.verify)) {
                _context.next = 14;
                break;
              }

              if (!(typeof storedContents !== 'string')) {
                _context.next = 11;
                break;
              }

              throw new Error('Expected to get back a string for the cipherText');

            case 11:
              return _context.abrupt('return', { content: decryptContent(storedContents), contentType: contentType });

            case 14:
              if (!(opt.decrypt && opt.verify)) {
                _context.next = 20;
                break;
              }

              if (!(typeof storedContents !== 'string')) {
                _context.next = 17;
                break;
              }

              throw new Error('Expected to get back a string for the cipherText');

            case 17:
              return _context.abrupt('return', handleSignedEncryptedContents(path, storedContents, opt.app, opt.username, opt.zoneFileLookupURL));

            case 20:
              if (!(!opt.verify && !opt.decrypt)) {
                _context.next = 24;
                break;
              }

              return _context.abrupt('return', { content: storedContents, contentType: contentType });

            case 24:
              throw new Error('Should be unreachable.');

            case 25:
            case 'end':
              return _context.stop();
          }
        }
      }, _callee, _this);
    }));

    return function (_x2) {
      return _ref3.apply(this, arguments);
    };
  }());
}

/**
 * Stores the data provided in the app's data store to to the file specified.
 * @param {String} path - the path to store the data in
 * @param {String|Buffer} content - the data to store in the file
 * @param {Object} [options=null] - options object
 * @param {Boolean|String} [options.encrypt=true] - encrypt the data with the app public key
 *                                                  or the provided public key
 * @param {Boolean} [options.sign=false] - sign the data using ECDSA on SHA256 hashes with
 *                                         the app private key
 * @param {String} [options.contentType=''] - set a Content-Type header for unencrypted data
 * @return {Promise} that resolves if the operation succeed and rejects
 * if it failed
 */
function putFile(path, content, options) {
  var defaults = {
    encrypt: true,
    sign: false,
    contentType: ''
  };

  var opt = Object.assign({}, defaults, options);

  var contentType = opt.contentType;

  if (!contentType) {
    contentType = typeof content === 'string' ? 'text/plain; charset=utf-8' : 'application/octet-stream';
  }

  // First, let's figure out if we need to get public/private keys,
  //  or if they were passed in

  var privateKey = '';
  var publicKey = '';
  if (opt.sign) {
    if (typeof opt.sign === 'string') {
      privateKey = opt.sign;
    } else {
      privateKey = (0, _auth.loadUserData)().appPrivateKey;
    }
  }
  if (opt.encrypt) {
    if (typeof opt.encrypt === 'string') {
      publicKey = opt.encrypt;
    } else {
      if (!privateKey) {
        privateKey = (0, _auth.loadUserData)().appPrivateKey;
      }
      publicKey = (0, _keys.getPublicKeyFromPrivate)(privateKey);
    }
  }

  // In the case of signing, but *not* encrypting,
  //   we perform two uploads. So the control-flow
  //   here will return there.
  if (!opt.encrypt && opt.sign) {
    var signatureObject = (0, _encryption.signECDSA)(privateKey, content);
    var signatureContent = JSON.stringify(signatureObject);
    return (0, _hub.getOrSetLocalGaiaHubConnection)().then(function (gaiaHubConfig) {
      return new Promise(function (resolve, reject) {
        return Promise.all([(0, _hub.uploadToGaiaHub)(path, content, gaiaHubConfig, contentType), (0, _hub.uploadToGaiaHub)('' + path + SIGNATURE_FILE_SUFFIX, signatureContent, gaiaHubConfig, 'application/json')]).then(resolve).catch(function () {
          (0, _hub.setLocalGaiaHubConnection)().then(function (freshHubConfig) {
            return Promise.all([(0, _hub.uploadToGaiaHub)(path, content, freshHubConfig, contentType), (0, _hub.uploadToGaiaHub)('' + path + SIGNATURE_FILE_SUFFIX, signatureContent, freshHubConfig, 'application/json')]).then(resolve).catch(reject);
          });
        });
      });
    }).then(function (fileUrls) {
      return fileUrls[0];
    });
  }

  // In all other cases, we only need one upload.
  if (opt.encrypt && !opt.sign) {
    content = encryptContent(content, { publicKey: publicKey });
    contentType = 'application/json';
  } else if (opt.encrypt && opt.sign) {
    var cipherText = encryptContent(content, { publicKey: publicKey });
    var _signatureObject = (0, _encryption.signECDSA)(privateKey, cipherText);
    var signedCipherObject = {
      signature: _signatureObject.signature,
      publicKey: _signatureObject.publicKey,
      cipherText: cipherText
    };
    content = JSON.stringify(signedCipherObject);
    contentType = 'application/json';
  }
  return (0, _hub.getOrSetLocalGaiaHubConnection)().then(function (gaiaHubConfig) {
    return new Promise(function (resolve, reject) {
      (0, _hub.uploadToGaiaHub)(path, content, gaiaHubConfig, contentType).then(resolve).catch(function () {
        (0, _hub.setLocalGaiaHubConnection)().then(function (freshHubConfig) {
          return (0, _hub.uploadToGaiaHub)(path, content, freshHubConfig, contentType).then(resolve).catch(reject);
        });
      });
    });
  });
}

/**
 * Get the app storage bucket URL
 * @param {String} gaiaHubUrl - the gaia hub URL
 * @param {String} appPrivateKey - the app private key used to generate the app address
 * @returns {Promise} That resolves to the URL of the app index file
 * or rejects if it fails
 */
function getAppBucketUrl(gaiaHubUrl, appPrivateKey) {
  return (0, _hub.getBucketUrl)(gaiaHubUrl, appPrivateKey);
}

/**
 * Deletes the specified file from the app's data store. Currently not implemented.
 * @param {String} path - the path to the file to delete
 * @returns {Promise} that resolves when the file has been removed
 * or rejects with an error
 * @private
 */
function deleteFile(path) {
  Promise.reject(new Error('Delete of ' + path + ' not supported by gaia hubs'));
}

/**
 * Loop over the list of files in a Gaia hub, and run a callback on each entry.
 * Not meant to be called by external clients.
 * @param {GaiaHubConfig} hubConfig - the Gaia hub config
 * @param {String | null} page - the page ID
 * @param {number} callCount - the loop count
 * @param {number} fileCount - the number of files listed so far
 * @param {function} callback - the callback to invoke on each file.  If it returns a falsey
 *  value, then the loop stops.  If it returns a truthy value, the loop continues.
 * @returns {Promise} that resolves to the number of files listed.
 * @private
 */
function listFilesLoop(hubConfig, page, callCount, fileCount, callback) {
  if (callCount > 65536) {
    // this is ridiculously huge, and probably indicates
    // a faulty Gaia hub anyway (e.g. on that serves endless data)
    throw new Error('Too many entries to list');
  }

  var httpStatus = void 0;
  var pageRequest = JSON.stringify({ page: page });

  var fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': '' + pageRequest.length,
      Authorization: 'bearer ' + hubConfig.token
    },
    body: pageRequest
  };

  return fetch(hubConfig.server + '/list-files/' + hubConfig.address, fetchOptions).then(function (response) {
    httpStatus = response.status;
    if (httpStatus >= 400) {
      throw new Error('listFiles failed with HTTP status ' + httpStatus);
    }
    return response.text();
  }).then(function (responseText) {
    return JSON.parse(responseText);
  }).then(function (responseJSON) {
    var entries = responseJSON.entries;
    var nextPage = responseJSON.page;
    if (entries === null || entries === undefined) {
      // indicates a misbehaving Gaia hub or a misbehaving driver
      // (i.e. the data is malformed)
      throw new Error('Bad listFiles response: no entries');
    }
    for (var i = 0; i < entries.length; i++) {
      var rc = callback(entries[i]);
      if (!rc) {
        // callback indicates that we're done
        return Promise.resolve(fileCount + i);
      }
    }
    if (nextPage && entries.length > 0) {
      // keep going -- have more entries
      return listFilesLoop(hubConfig, nextPage, callCount + 1, fileCount + entries.length, callback);
    } else {
      // no more entries -- end of data
      return Promise.resolve(fileCount + entries.length);
    }
  });
}

/**
 * List the set of files in this application's Gaia storage bucket.
 * @param {function} callback - a callback to invoke on each named file that
 * returns `true` to continue the listing operation or `false` to end it
 * @return {Promise} that resolves to the number of files listed
 */
function listFiles(callback) {
  return (0, _hub.getOrSetLocalGaiaHubConnection)().then(function (gaiaHubConfig) {
    return listFilesLoop(gaiaHubConfig, null, 0, 0, callback);
  });
}

exports.connectToGaiaHub = _hub.connectToGaiaHub;
exports.uploadToGaiaHub = _hub.uploadToGaiaHub;
exports.BLOCKSTACK_GAIA_HUB_LABEL = _hub.BLOCKSTACK_GAIA_HUB_LABEL;
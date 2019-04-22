const fs = require('fs');
const path = require('path');
const finParser = require('./finParser.js');
const mtParser = require('./mtParser.js');
const block1Parser = require('./block1Parser');
const block2Parser = require('./block2Parser');
const messageGenerator = require('./messageGenerator');
const { Logger, mkDirByPathSync } = require('./utils');
const moment = require('moment');
const patterns = require('./metadata/patterns.json');

const logger = new Logger();

class Swift {
  constructor(options = {}) {
    if (options.fieldPatterns) {
      this.fieldPatterns =
        JSON.parse(fs.readFileSync(path.resolve(process.cwd(), options.fieldPatterns)));
    } else {
      this.fieldPatterns = patterns
    }
    this.inputFolder = options.in ? path.resolve(process.cwd(), options.in) : path.resolve(process.cwd(), './in');
    this.outputFolder =
      options.out ? path.resolve(process.cwd(), options.out) : path.resolve(process.cwd(), './out');
    logger.setLogLevel(options.logLevel || 0);
    logger.setElastic(options.elastic || false);
    this.saveIncomingMessages = options.saveIncomingMessages || false;
    this.filters = [];
    this.filtersEvery = [];
    this.messages = [];
    this.persistent = options.persistent || true;
    this.deleteFiles = options.delete || false;
  }

  cleanMessages() {
    this.messages = [];
  }

  getMessages() {
    return this.messages;
  }

  cleanListeners() {
    this.filters = [];
    this.filtersEvery = [];
  }

  on(predicate, callback) {
    if (typeof predicate !== 'function') {
      throw new Error('predicate is not a function');
    }
    if (typeof callback !== 'function') {
      throw new Error('callback should be a function');
    }

    logger.debug(`Create subscriber: ${predicate.toString()}`);

    this.filters.push({ predicate, callback });
  }

  onEvery(predicate, callback) {
    if (typeof predicate !== 'function') {
      throw new Error('predicate is not a function');
    }
    if (typeof callback !== 'function') {
      throw new Error('callback should be a function');
    }

    logger.debug(`Create every subscriber: ${predicate.toString()}`);

    this.filtersEvery.push({ predicate, callback });
  }


  close() {
    logger.trace('closing SWIFT client...');
    return this.watcher.close();
  }

  send(message, filenamePrefix = '', outPath = this.outputFolder) {
    let out;
    if (typeof message === 'string') {
      out = message;
    }
    if (Array.isArray(message)) {
      out = this.generate(message);
    }
    if (!out) {
      throw new Error('output message was not created');
    }
    if (out instanceof Error) {
      throw out;
    }

    const filePath = path.resolve(outPath, `${filenamePrefix !== '' ? `${filenamePrefix}-` : ''}${moment().format('YYYY-MM-DD-HH:mm:ss')}.fin`);
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, out, (err) => {
        if (err) reject(err);
        else {
          logger.trace(`Write outfile ${filePath}`);
          resolve(out);
        }
      });
    });
  }

  parse(swiftMessage) {
    // eslint-disable-next-line no-param-reassign
    swiftMessage = swiftMessage.replace(/\r\n/g, '\n');
    const ast = finParser.parse(swiftMessage);

    const humanizeBlocks = (blocks) => {
      Object.keys(blocks).forEach((name) => {
        switch (name) {
          case 'block1':
            // eslint-disable-next-line no-param-reassign
            blocks.block1 = block1Parser.parse(blocks.block1.content[0]);
            break;
          case 'block2':
            // eslint-disable-next-line no-param-reassign
            blocks.block2 = block2Parser.parse(blocks.block2.content[0]);
            break;
          case 'extraBlocks':
            // eslint-disable-next-line no-param-reassign
            blocks.extraBlocks = humanizeBlocks(blocks.extraBlocks);
            break;
          default:
            // eslint-disable-next-line no-param-reassign
            blocks[name] = mtParser.parse(blocks[name], this.fieldPatterns);
            break;
        }
      });
      return blocks;
    };
    const res = humanizeBlocks(ast);

    return res;
  }

  // eslint-disable-next-line class-methods-use-this
  generate(data) {
    return messageGenerator(data);
  }
}

module.exports = Swift;

if (typeof global.File === 'undefined') {
  global.File = class File extends Blob {
    constructor(bits, name, options = {}) {
      super(bits, options);
      this.name = name;
      this.lastModified = options.lastModified ?? Date.now();
      this.type = options.type ?? '';
    }
  };
}

const documents = require('../../data/legal-documents');

Page({
  data: { title: '', version: '', sections: [] },
  onLoad(query) {
    const type = query.type === 'privacy' ? 'privacy' : 'terms';
    this._type = type;
    const document = documents[type];
    this.setData({ title: document.title, version: document.version, sections: document.sections });
    wx.setNavigationBarTitle({ title: document.title });
  },
  onReachBottom() {
    const channel = this.getOpenerEventChannel && this.getOpenerEventChannel();
    if (channel && this._type) channel.emit('legalDocumentRead', { type: this._type });
  }
});

(function exposeRequestState(root) {
  "use strict";

  class RequestState {
    constructor() {
      this.revision = 0;
      this.active = null;
    }

    begin(snapshot) {
      if (this.active) return null;
      const request = { revision: this.revision, snapshot, controller: new AbortController() };
      this.active = request;
      return request;
    }

    isCurrent(request) {
      return this.active === request && request.revision === this.revision;
    }

    invalidate() {
      this.revision += 1;
      this.active?.controller.abort();
      this.active = null;
    }

    finish(request) {
      if (!this.isCurrent(request)) return false;
      this.active = null;
      return true;
    }
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { RequestState };
  else root.BurontRequestState = RequestState;
})(globalThis);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
function ConfigRead(config) {
    if (config) {
        return config;
    }
    else {
        if (fs_1.existsSync(`${process.cwd()}/mailerconfig.js`)) {
            try {
                return config = require(`${process.cwd()}/mailerconfig`);
            }
            catch (err) {
                return {};
            }
        }
        else {
            return {};
        }
    }
}
exports.ConfigRead = ConfigRead;
//# sourceMappingURL=mailer.utils.js.map
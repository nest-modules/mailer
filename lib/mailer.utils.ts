import { existsSync } from 'fs';
   
  export function ConfigRead(config: any) {
   if (config) {
    return config
  } else {
    if (existsSync(`${process.cwd()}/mailerconfig.js`)) {
      try {
        return config = require(`${process.cwd()}/mailerconfig`);
      } catch (err) {
        return {}
      }
    } else {
      return {}
    }
  } 
}
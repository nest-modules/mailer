/** Dependencies **/
import { existsSync } from 'fs';

export function ConfigRead(config: any) {
  if (config) {
    return config;
  }

  if (!existsSync(`${process.cwd()}/mailerconfig.js`)) {
    return {};
  }

  try {
    return require(`${process.cwd()}/mailerconfig`);
  } catch (err) {
    return {};
  }
}
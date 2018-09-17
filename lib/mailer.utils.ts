/** Dependencies **/
import { existsSync } from 'fs';

export function ConfigRead(config: any) {
  if (config) {
    return config;
  }

  const configName = 'mailerconfig';
  const foundFileFormat = ['ts', 'js'].find(format => {
    return existsSync(`${process.cwd()}/${configName}.${format}`);
  });

  if (foundFileFormat != undefined) {
    return require(`${process.cwd()}/${configName}.${foundFileFormat}`);
  } else {
    return {};
  }
}

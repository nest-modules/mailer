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

export function getProperty(target: object, propertyPath: Array<string>, defaultValue = null) {
  return propertyPath.reduce(
    (currentPath, currentProperty) => (currentPath && currentPath[currentProperty])
      ? currentPath[currentProperty]
      : defaultValue
  , target);
}

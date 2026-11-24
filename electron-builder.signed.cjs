const { build } = require('./package.json');

module.exports = {
  ...build,
  publish: [{ provider: 'github', owner: 'vlmbuyd', repo: 'daru', releaseType: 'draft' }],
  forceCodeSigning: true,
  mac: {
    ...build.mac,
    target: [{ target: 'dmg', arch: 'universal' }, { target: 'zip', arch: 'universal' }],
    hardenedRuntime: true,
    notarize: true,
  },
};

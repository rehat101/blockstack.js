# blockstack.js

Added support for sending `content-type` headers on `getFile()` method 

## Testing

    $ npm run test

    We test on the "Active LTS" version of Node.

### Testing in a browser

_This test will only work with your browser's Cross-Origin Restrictions disabled._

Run `npm run compile; npm run browserify` before opening the file `test.html`
in your browser.

## Releasing

- `git flow release start <version>`
- Add section to `CHANGELOG.md`
- Increment version in `package.json` and commit
- `npm publish`
- Commit built documentation and distribution
- `git flow release finish`

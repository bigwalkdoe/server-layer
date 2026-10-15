# Pull Request Template

## Summary

<!-- One paragraph: what does this change and why. Link the issue if there is one. -->

## Checks

- [ ] `npm test` passes in `app/`
- [ ] `shellcheck -S style` passes on any changed scripts
- [ ] `./smoke-test.sh` passes against a running stack
- [ ] No secrets, keys, or generated certs added (see `.gitignore`)
- [ ] README updated if behaviour, env vars, or new services changed
- [ ] New behaviour has a test (unit in `app/test/`, or a smoke assertion)

## Notes for reviewers

<!-- Anything that isn't obvious from the diff: SELinux, port clashes,
     a break in the expected start/stop flow, or a trade-off you made. -->

## Risk

<!-- Default "low". If non-trivial, say what could break and how to roll back. -->

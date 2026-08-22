---
'tryscript': patch
---

Expand environment variables in `env:` front matter, and add `TRYSCRIPT_EXE`.

`path:` entries already expanded `$TRYSCRIPT_GIT_ROOT` and friends; `env:` values did
not, passing the literal string through. The two fields disagreed about what `$VAR`
meant, so a test could name a *directory* by absolute path but never a *file*.

That gap mattered because `path:` only prepends to the inherited `PATH`. A test naming
its binary by bare name could silently resolve a different build installed elsewhere on
the machine and pass, and the only way to pin an exact executable was an external
wrapper that set the variable before tryscript ran. Front matter can now say it
directly:

```yaml
env:
  TOOL: $TRYSCRIPT_GIT_ROOT/target/debug/tool$TRYSCRIPT_EXE
```

`TRYSCRIPT_EXE` is `.exe` on Windows and empty elsewhere, so that line stays portable.

Because `env:` values are arbitrary strings rather than paths, `$$` now expands to a
literal `$` in both `env:` and `path:`, so a value that has to keep a `$` is not
substituted away. Expansion is also single-pass: a variable whose value contains `$VAR`
keeps that text instead of expanding a second time.

---
env:
  NO_COLOR: "1"
  MY_CUSTOM_VAR: "hello-world"
patterns:
  TIMESTAMP: '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
  DURATION: '\d+(\.\d+)?ms'
  UUID: '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
---

# Test: Custom TIMESTAMP pattern

```console
$ node -e "console.log('Created: ' + new Date().toISOString())"
Created: [TIMESTAMP][..]
? 0
```

# Test: Custom DURATION pattern

```console
$ node -e "console.log('Completed in 123.45ms')"
Completed in [DURATION]
? 0
```

# Test: Environment variable from frontmatter

```console
$ node -e "console.log('NO_COLOR=' + process.env.NO_COLOR)"
NO_COLOR=1
? 0
```

# Test: Custom environment variable

```console
$ node -e "console.log('MY_CUSTOM_VAR=' + process.env.MY_CUSTOM_VAR)"
MY_CUSTOM_VAR=hello-world
? 0
```

# Test: Multiple custom patterns combined

```console
$ node -e "console.log('[' + new Date().toISOString() + '] Done in 50ms')"
[[TIMESTAMP][..]] Done in [DURATION]
? 0
```

# Test: UUID pattern

```console
$ node -e "const crypto = require('crypto'); console.log('ID: ' + crypto.randomUUID())"
ID: [UUID]
? 0
```

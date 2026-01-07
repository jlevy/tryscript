#!/usr/bin/env bash
# Mock CLI for tryscript example

case "$1" in
  --help)
    echo "Usage: my-cli [options] <command>"
    echo ""
    echo "Options:"
    echo "  --version  Show version"
    echo "  --help     Show this help"
    ;;
  --version)
    echo "my-cli v1.2.3"
    ;;
  process)
    if [[ -z "$2" ]]; then
      echo "Error: missing required argument 'file'" >&2
      exit 1
    fi
    echo "Processing: $2"
    echo "status: success"
    echo "Done"
    ;;
  *)
    echo "Error: unknown command '$1'" >&2
    exit 1
    ;;
esac

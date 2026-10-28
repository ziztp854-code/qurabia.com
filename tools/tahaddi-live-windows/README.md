# Tahaddi Live Windows launcher

This small Windows x64 executable opens `https://qurabia.com/voice/` in the default browser. It requires an internet connection and opens the currently deployed site; local changes do not appear until deployed. It is a launcher, not an offline desktop app. Browser permissions govern microphone access.

Build with Go on any supported host:

```sh
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags='-H=windowsgui -s -w' -o Tahaddi-Live.exe ./tools/tahaddi-live-windows/main.go
```

The executable is unsigned. Test on Windows before distribution.

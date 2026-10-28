//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func main() {
	shell := syscall.NewLazyDLL("shell32.dll").NewProc("ShellExecuteW")
	verb, _ := syscall.UTF16PtrFromString("open")
	url, _ := syscall.UTF16PtrFromString("https://qurabia.com/voice/")
	result, _, _ := shell.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(url)), 0, 0, 1)
	if result <= 32 {
		title, _ := syscall.UTF16PtrFromString("Tahaddi Live")
		message, _ := syscall.UTF16PtrFromString("Unable to open the browser. Visit https://qurabia.com/voice/ manually.")
		syscall.NewLazyDLL("user32.dll").NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(message)), uintptr(unsafe.Pointer(title)), 0x10)
	}
}

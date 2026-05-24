package main

import (
	"reflect"
	"testing"
)

func TestSplitCommandKeepsQuotedValues(t *testing.T) {
	args, err := splitCommand(`new --repo openclaw/openclaw --command 'codex --yolo' 'fix the failing check'`)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"new",
		"--repo",
		"openclaw/openclaw",
		"--command",
		"codex --yolo",
		"fix the failing check",
	}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

func TestSplitCommandPreservesBackslashesInSingleQuotes(t *testing.T) {
	args, err := splitCommand(`new 'fix regex \d+ in parser'`)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"new", `fix regex \d+ in parser`}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("args = %#v, want %#v", args, want)
	}
}

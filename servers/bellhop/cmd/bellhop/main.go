// Command bellhop starts the configured HTTP relay.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/app"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/config"
	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/console"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		console.New(os.Stderr, console.IsTerminal(os.Stderr), console.ColorEnabled(os.Stderr)).Error(err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	resolvedPath, overrides, err := parseInvocation(arguments)
	if err != nil {
		return err
	}
	return app.Run(resolvedPath, overrides)
}

func parseInvocation(arguments []string) (string, config.LaunchOverrides, error) {
	flags := flag.NewFlagSet("bellhop", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	configPath := flags.String("config", "", "path to config.json")
	hostOverride := flags.String("host", "", "HTTP listen host")
	portOverride := flags.String("port", "", "HTTP listen port")
	allowedOriginsOverride := flags.String("allowed-origins", "", "comma-separated browser origins")
	if err := flags.Parse(arguments); err != nil {
		return "", config.LaunchOverrides{}, err
	}
	if flags.NArg() != 0 {
		return "", config.LaunchOverrides{}, fmt.Errorf("unexpected arguments: %v", flags.Args())
	}

	resolvedPath, err := config.ResolvePath(*configPath)
	if err != nil {
		return "", config.LaunchOverrides{}, err
	}

	overrides := config.LaunchOverrides{}
	flags.Visit(func(parsedFlag *flag.Flag) {
		switch parsedFlag.Name {
		case "host":
			overrides.HostSet = true
		case "port":
			overrides.PortSet = true
		case "allowed-origins":
			overrides.AllowedOriginsSet = true
		}
	})
	if overrides.HostSet {
		overrides.Host = *hostOverride
	}
	if overrides.PortSet {
		port, err := strconv.Atoi(*portOverride)
		if err != nil || port < 1 || port > 65535 {
			return "", config.LaunchOverrides{}, fmt.Errorf("invalid --port %q: must be an integer from 1 to 65535", *portOverride)
		}
		overrides.Port = port
	}
	if overrides.AllowedOriginsSet {
		allowedOrigins, err := config.ParseAllowedOrigins(*allowedOriginsOverride)
		if err != nil {
			return "", config.LaunchOverrides{}, err
		}
		overrides.AllowedOrigins = allowedOrigins
	}

	return resolvedPath, overrides, nil
}

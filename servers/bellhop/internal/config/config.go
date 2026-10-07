// Package config owns Bellhop's external configuration boundary: path
// selection, starter creation, JSON decoding, defaults, and validation.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"
)

const (
	defaultHost    = "127.0.0.1"
	defaultPort    = 2355
	starterContent = `{"mounts": []}`
)

// Config is the validated configuration consumed by the application.
type Config struct {
	Host           string
	Port           int
	AllowedOrigins []string
	Mounts         []Mount
}

// LaunchOverrides records values explicitly supplied by command-line flags.
// Set values remain authoritative every time the configuration file is loaded.
type LaunchOverrides struct {
	Host              string
	HostSet           bool
	Port              int
	PortSet           bool
	AllowedOrigins    []string
	AllowedOriginsSet bool
}

// Mount describes one child service.
type Mount struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Command     []string `json:"command"`
}

type fileConfig struct {
	Host           string   `json:"host"`
	Port           int      `json:"port"`
	AllowedOrigins []string `json:"allowed_origins"`
	Mounts         *[]Mount `json:"mounts"`
}

// ResolvePath selects the literal configuration path according to the CLI and
// environment precedence in the Bellhop specification.
func ResolvePath(flagPath string) (string, error) {
	if flagPath != "" {
		return flagPath, nil
	}
	if environmentPath := os.Getenv("BELLHOP_CONFIG"); environmentPath != "" {
		return environmentPath, nil
	}
	homeDirectory, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home directory: %w", err)
	}
	return filepath.Join(homeDirectory, ".bellhop.json"), nil
}

// Load creates a starter file when needed, then decodes and validates it.
func Load(path string) (Config, error) {
	return load(path, os.OpenFile)
}

// LoadWithOverrides loads and validates path, then reapplies launch-time flag
// values so startup and reload use exactly the same precedence.
func LoadWithOverrides(path string, overrides LaunchOverrides) (Config, error) {
	configuration, err := Load(path)
	if err != nil {
		return Config{}, err
	}
	applyOverrides(&configuration, overrides)
	return configuration, nil
}

// LoadExistingWithOverrides loads and validates an existing file without
// creating a starter, then reapplies launch-time flag values.
func LoadExistingWithOverrides(path string, overrides LaunchOverrides) (Config, error) {
	configuration, err := loadExisting(path)
	if err != nil {
		return Config{}, err
	}
	applyOverrides(&configuration, overrides)
	return configuration, nil
}

func applyOverrides(configuration *Config, overrides LaunchOverrides) {
	if overrides.HostSet {
		configuration.Host = overrides.Host
	}
	if overrides.PortSet {
		configuration.Port = overrides.Port
	}
	if overrides.AllowedOriginsSet {
		configuration.AllowedOrigins = append([]string(nil), overrides.AllowedOrigins...)
	}
}

// ParseAllowedOrigins parses and validates the command-line origin override.
func ParseAllowedOrigins(value string) ([]string, error) {
	if value == "" {
		return []string{}, nil
	}
	allowedOrigins := strings.Split(value, ",")
	if err := validateAllowedOrigins(allowedOrigins); err != nil {
		return nil, err
	}
	return allowedOrigins, nil
}

type openFileFunc func(string, int, os.FileMode) (*os.File, error)

func load(path string, openFile openFileFunc) (Config, error) {
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if err := createStarter(path, openFile); err != nil {
			return Config{}, err
		}
		content, err = os.ReadFile(path)
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config %q: %w", path, err)
	}
	return decode(path, content)
}

func loadExisting(path string) (Config, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config %q: %w", path, err)
	}
	return decode(path, content)
}

func decode(path string, content []byte) (Config, error) {
	var parsed fileConfig
	decoder := json.NewDecoder(bytes.NewReader(content))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&parsed); err != nil {
		return Config{}, parseError(path, content, decoder.InputOffset(), err)
	}
	extraValueOffset := nextJSONValueOffset(content, decoder.InputOffset())
	if err := requireEndOfJSON(decoder); err != nil {
		return Config{}, parseError(path, content, extraValueOffset, err)
	}
	return validate(parsed)
}

func parseError(path string, content []byte, fallbackOffset int64, err error) error {
	offset := fallbackOffset
	if errors.Is(err, io.ErrUnexpectedEOF) {
		offset = int64(len(content)) + 1
	}
	var syntaxError *json.SyntaxError
	if errors.As(err, &syntaxError) {
		offset = syntaxError.Offset
	}
	var typeError *json.UnmarshalTypeError
	if errors.As(err, &typeError) {
		offset = typeError.Offset
	}
	if unknownFieldOffset, found := findUnknownFieldOffset(content, err); found {
		offset = unknownFieldOffset
	}
	index := offset - 1
	if index < 0 {
		index = 0
	}
	if index > int64(len(content)) {
		index = int64(len(content))
	}
	line := bytes.Count(content[:index], []byte{'\n'}) + 1
	return fmt.Errorf("parse config %q line %d: %w", path, line, err)
}

// findUnknownFieldOffset walks the document to the first field the schema
// does not recognize. The recognized names must track fileConfig and Mount.
func findUnknownFieldOffset(content []byte, err error) (int64, bool) {
	_, found := strings.CutPrefix(err.Error(), "json: unknown field ")
	if !found {
		return 0, false
	}
	decoder := json.NewDecoder(bytes.NewReader(content))
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return 0, false
	}
	return findUnknownRootFieldOffset(decoder, content)
}

func findUnknownRootFieldOffset(decoder *json.Decoder, content []byte) (int64, bool) {
	for decoder.More() {
		beforeKey := decoder.InputOffset()
		token, err := decoder.Token()
		if err != nil {
			return 0, false
		}
		field, ok := token.(string)
		if !ok {
			return 0, false
		}
		offset := jsonKeyOffset(content, beforeKey, decoder.InputOffset())
		switch {
		case strings.EqualFold(field, "mounts"):
			if offset, found := findUnknownMountFieldOffset(decoder, content); found {
				return offset, true
			}
		case strings.EqualFold(field, "host"),
			strings.EqualFold(field, "port"),
			strings.EqualFold(field, "allowed_origins"):
			if err := skipJSONValue(decoder); err != nil {
				return 0, false
			}
		default:
			return offset, true
		}
	}
	return 0, false
}

func findUnknownMountFieldOffset(decoder *json.Decoder, content []byte) (int64, bool) {
	token, err := decoder.Token()
	if err != nil || token != json.Delim('[') {
		return 0, false
	}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil || token != json.Delim('{') {
			return 0, false
		}
		for decoder.More() {
			beforeKey := decoder.InputOffset()
			token, err := decoder.Token()
			if err != nil {
				return 0, false
			}
			field, ok := token.(string)
			if !ok {
				return 0, false
			}
			offset := jsonKeyOffset(content, beforeKey, decoder.InputOffset())
			if !strings.EqualFold(field, "name") &&
				!strings.EqualFold(field, "description") &&
				!strings.EqualFold(field, "command") {
				return offset, true
			}
			if err := skipJSONValue(decoder); err != nil {
				return 0, false
			}
		}
		if _, err := decoder.Token(); err != nil {
			return 0, false
		}
	}
	if _, err := decoder.Token(); err != nil {
		return 0, false
	}
	return 0, false
}

func skipJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, nested := token.(json.Delim)
	if !nested {
		return nil
	}
	switch delimiter {
	case '{':
		for decoder.More() {
			if _, err := decoder.Token(); err != nil {
				return err
			}
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	case '[':
		for decoder.More() {
			if err := skipJSONValue(decoder); err != nil {
				return err
			}
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	_, err = decoder.Token()
	return err
}

func jsonKeyOffset(content []byte, before, after int64) int64 {
	start := int(before)
	end := int(after)
	if start < 0 || start > len(content) || end < start || end > len(content) {
		return after
	}
	quote := bytes.IndexByte(content[start:end], '"')
	if quote < 0 {
		return after
	}
	return int64(start + quote + 1)
}

func nextJSONValueOffset(content []byte, previousEnd int64) int64 {
	start := int(previousEnd)
	for start < len(content) {
		switch content[start] {
		case ' ', '\t', '\r', '\n':
			start++
		default:
			return int64(start + 1)
		}
	}
	return int64(len(content) + 1)
}

func createStarter(path string, openFile openFileFunc) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create config directory for %q: %w", path, err)
	}

	file, err := openFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("write starter config %q: %w", path, err)
	}
	if _, err := file.WriteString(starterContent); err != nil {
		_ = file.Close()
		return fmt.Errorf("write starter config %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("write starter config %q: %w", path, err)
	}
	return nil
}

func requireEndOfJSON(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}

func validate(parsed fileConfig) (Config, error) {
	if parsed.Mounts == nil {
		return Config{}, errors.New(`validate config: "mounts" must be an array`)
	}

	host := parsed.Host
	if host == "" {
		host = defaultHost
	}
	port := parsed.Port
	if port == 0 {
		port = defaultPort
	}
	if port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("validate config: port %d is outside 1-65535", port)
	}

	allowedOrigins := make([]string, len(parsed.AllowedOrigins))
	copy(allowedOrigins, parsed.AllowedOrigins)
	if err := validateAllowedOrigins(allowedOrigins); err != nil {
		return Config{}, err
	}

	names := make(map[string]struct{}, len(*parsed.Mounts))
	mounts := make([]Mount, len(*parsed.Mounts))
	copy(mounts, *parsed.Mounts)
	for index := range mounts {
		mount := &mounts[index]
		if mount.Name == "" {
			return Config{}, fmt.Errorf("validate config: mount %d has an empty name", index)
		}
		if mount.Name == "." || mount.Name == ".." {
			return Config{}, fmt.Errorf("validate config: mount name %q is not allowed", mount.Name)
		}
		if strings.ContainsAny(mount.Name, `/\`) {
			return Config{}, fmt.Errorf("validate config: mount name %q contains a slash or backslash", mount.Name)
		}
		if strings.IndexFunc(mount.Name, unicode.IsControl) >= 0 {
			return Config{}, fmt.Errorf("validate config: mount name %q contains a control character", mount.Name)
		}
		if _, exists := names[mount.Name]; exists {
			return Config{}, fmt.Errorf("validate config: duplicate mount name %q", mount.Name)
		}
		names[mount.Name] = struct{}{}
		if len(mount.Command) == 0 || mount.Command[0] == "" {
			return Config{}, fmt.Errorf("validate config: mount %q has an empty command", mount.Name)
		}
	}

	return Config{Host: host, Port: port, AllowedOrigins: allowedOrigins, Mounts: mounts}, nil
}

func validateAllowedOrigins(allowedOrigins []string) error {
	if len(allowedOrigins) > 1 {
		for _, origin := range allowedOrigins {
			if origin == "*" {
				return errors.New(`validate config: allowed origin "*" must be the sole element`)
			}
		}
	}
	for index, origin := range allowedOrigins {
		if origin == "*" {
			continue
		}
		if !isNamedOrigin(origin) && !isWildcardPortOrigin(origin) {
			return fmt.Errorf(
				"validate config: allowed origin %d %q must be \"*\", an exact scheme://host[:port] origin, or scheme://host:* for any port",
				index,
				origin,
			)
		}
	}
	return nil
}

// isWildcardPortOrigin reports whether origin is scheme://host:* — a named
// scheme and host permitted on any port, including none.
func isWildcardPortOrigin(origin string) bool {
	base, found := strings.CutSuffix(origin, ":*")
	if !found {
		return false
	}
	parsedBase, err := url.Parse(base)
	if err != nil || parsedBase.Port() != "" {
		return false
	}
	return isNamedOrigin(base)
}

func isNamedOrigin(origin string) bool {
	parsedOrigin, err := url.Parse(origin)
	if err != nil ||
		parsedOrigin.Scheme == "" ||
		parsedOrigin.Host == "" ||
		parsedOrigin.Hostname() == "" ||
		strings.Contains(parsedOrigin.Hostname(), "*") ||
		parsedOrigin.User != nil ||
		parsedOrigin.Opaque != "" ||
		parsedOrigin.Path != "" ||
		parsedOrigin.RawPath != "" ||
		parsedOrigin.RawQuery != "" ||
		parsedOrigin.ForceQuery ||
		parsedOrigin.Fragment != "" ||
		strings.Contains(origin, "#") ||
		strings.HasSuffix(parsedOrigin.Host, ":") {
		return false
	}
	if port := parsedOrigin.Port(); port != "" {
		number, err := strconv.Atoi(port)
		if err != nil || number < 1 || number > 65535 {
			return false
		}
	}
	return true
}

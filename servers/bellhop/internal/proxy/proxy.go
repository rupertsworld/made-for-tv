// Package proxy routes public mount paths to dynamically discovered child
// addresses and delegates HTTP transport semantics to httputil.ReverseProxy.
package proxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/rupertsworld/made-for-tv/servers/bellhop/internal/supervisor"
)

type proxyTarget interface {
	Address() string
}

// Handler returns a mount router backed by live supervisor targets.
func Handler(targets map[string]*supervisor.Target) http.Handler {
	proxyTargets := make(map[string]proxyTarget, len(targets))
	for name, target := range targets {
		proxyTargets[name] = target
	}
	return handlerForTargets(proxyTargets)
}

func handlerForTargets(targets map[string]proxyTarget) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		name, remainingPath, matched := matchMount(request.URL.Path, targets)
		if !matched {
			http.NotFound(response, request)
			return
		}
		target := targets[name]
		address := target.Address()
		if address == "" {
			http.Error(response, http.StatusText(http.StatusServiceUnavailable), http.StatusServiceUnavailable)
			return
		}

		remainingRawPath := rawRemainder(request.URL.EscapedPath(), name)
		reverseProxy := &httputil.ReverseProxy{
			Director: func(outbound *http.Request) {
				outbound.URL.Scheme = "http"
				outbound.URL.Host = address
				outbound.URL.Path = remainingPath
				outbound.URL.RawPath = remainingRawPath
				// Deliberately retain outbound.Host: mounted services see the
				// public Bellhop Host, while URL.Host selects the TCP target.
			},
			ErrorHandler: func(writer http.ResponseWriter, _ *http.Request, _ error) {
				http.Error(writer, http.StatusText(http.StatusBadGateway), http.StatusBadGateway)
			},
			// Bellhop owns CORS for mounted services. Remove a child service's
			// CORS headers before ReverseProxy copies them into the response so
			// it cannot duplicate the outer origin handler's headers.
			ModifyResponse: stripCORSHeaders,
		}
		reverseProxy.ServeHTTP(response, request)
	})
}

func stripCORSHeaders(response *http.Response) error {
	const prefix = "Access-Control-"
	for header := range response.Header {
		if len(header) >= len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
			delete(response.Header, header)
		}
	}
	return nil
}

func rawRemainder(escapedPath, decodedName string) string {
	if !strings.HasPrefix(escapedPath, "/") {
		return ""
	}
	segmentEnd := strings.IndexByte(escapedPath[1:], '/')
	encodedName := escapedPath[1:]
	remainder := "/"
	if segmentEnd >= 0 {
		segmentEnd++
		encodedName = escapedPath[1:segmentEnd]
		remainder = escapedPath[segmentEnd:]
	}
	name, err := url.PathUnescape(encodedName)
	if err != nil || name != decodedName {
		return ""
	}
	return remainder
}

func matchMount(path string, targets map[string]proxyTarget) (string, string, bool) {
	for name := range targets {
		prefix := "/" + name
		switch {
		case path == prefix:
			return name, "/", true
		case strings.HasPrefix(path, prefix+"/"):
			return name, strings.TrimPrefix(path, prefix), true
		}
	}
	return "", "", false
}

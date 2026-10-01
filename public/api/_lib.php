<?php
// PHP port of lib/youcam.js + lib/http.js for Apache hosting. Same routes, same JSON.
// The key is read from the environment or from a config file OUTSIDE the web root:
//   1. env YOUCAM_API_KEY (e.g. SetEnv in the vhost)
//   2. file named by env PUOLISKO_CONFIG
//   3. <parent of DOCUMENT_ROOT>/puolisko-config.php
// The config file returns: ['YOUCAM_API_KEY' => '...', 'ACCESS_CODE' => '...']

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === '_lib.php') { http_response_code(404); exit; }

const YC_BASE = 'https://yce-api-01.makeupar.com';
const YC_CONCERNS = ['wrinkle', 'redness', 'dark_circle_v2', 'age_spot'];

function pk_config(string $name): string {
    static $file = null;
    $v = getenv($name);
    if ($v !== false && $v !== '') return $v;
    if ($file === null) {
        $file = [];
        $paths = array_filter([
            getenv('PUOLISKO_CONFIG') ?: null,
            isset($_SERVER['DOCUMENT_ROOT']) ? dirname($_SERVER['DOCUMENT_ROOT']) . '/puolisko-config.php' : null,
        ]);
        foreach ($paths as $p) {
            if (is_readable($p)) { $c = include $p; if (is_array($c)) { $file = $c; break; } }
        }
    }
    return (string)($file[$name] ?? '');
}

function pk_json(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode($body);
    exit;
}

function pk_fail(int $status, string $msg): void { pk_json($status, ['error' => $msg]); }

// If ACCESS_CODE is set, every unit-spending call must carry it.
function pk_check_access(): void {
    $want = pk_config('ACCESS_CODE');
    if ($want === '') return;
    $got = (string)($_SERVER['HTTP_X_ACCESS_CODE'] ?? '');
    if (!hash_equals($want, $got)) pk_fail(401, 'Access code required');
}

function pk_http(string $method, string $url, array $headers = [], ?string $body = null): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER => false,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) pk_fail(502, 'Upstream unreachable: ' . $err);
    return [$code, $resp, $type];
}

function pk_call(string $method, string $path, ?array $json = null): array {
    $key = pk_config('YOUCAM_API_KEY');
    if ($key === '') pk_fail(500, 'YOUCAM_API_KEY is not set on the server');
    [$code, $resp] = pk_http($method, YC_BASE . $path, [
        'Authorization: Bearer ' . $key,
        'Content-Type: application/json',
    ], $json === null ? null : json_encode($json));
    $body = json_decode($resp, true);
    if (!is_array($body)) pk_fail(502, "YouCam $code");
    if ($code >= 400 || (isset($body['status']) && (int)$body['status'] !== 200)) {
        $msg = $body['error'] ?? $body['error_code'] ?? $body['message'] ?? "YouCam $code";
        pk_fail($code >= 400 ? $code : 502, (string)$msg);
    }
    return $body['data'] ?? $body;
}

# Auto-updated by release.yml on tag v0.1.25. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.25"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.25/keirouter_v0.1.25_darwin_arm64.tar.gz"
      sha256 "18e4750937464121bc20f9a2eff335d19fe1325a899e9532239e22fe7eeee993"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.25/keirouter_v0.1.25_darwin_amd64.tar.gz"
      sha256 "59f66e219f07840bdb8fda9465e0846c58a9476d3351a21f834dbc46717d3cde"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.25/keirouter_v0.1.25_linux_arm64.tar.gz"
      sha256 "582b27026c07fc84876df244f95e01f41d9502d0d06a16624a5bedeea05a0e97"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.25/keirouter_v0.1.25_linux_amd64.tar.gz"
      sha256 "811bada5df8bf4ea9128e3e5f208167f6137d1bfc88fa26886e8e36744b25338"
    end
  end

  def install
    bin.install "keirouter"
    (share/"keirouter").install "frontend"
  end

  def caveats
    <<~EOS
      Quick start:
        keirouter -bootstrap    # create your first API key
        keirouter start         # start server on :20180

      Dashboard: http://localhost:20180  (default password: keirouter)
    EOS
  end

  test do
    assert_match "KeiRouter", shell_output("\#{bin}/keirouter --help 2>&1")
  end
end

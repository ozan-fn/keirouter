# Auto-updated by release.yml on tag v0.1.20. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.20"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.20/keirouter_v0.1.20_darwin_arm64.tar.gz"
      sha256 "98f90fcd19c05a3dc71c598744366798741b067d76cc346ed883aa05e5fabaf2"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.20/keirouter_v0.1.20_darwin_amd64.tar.gz"
      sha256 "6642b8ac68249ffb054700f6671984edc0fbafe04ae5d86dfe6dd23d897abd7a"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.20/keirouter_v0.1.20_linux_arm64.tar.gz"
      sha256 "dc8880c0140c67ee2f80a847e421c77e5b633d6c059270c0cdbe7656b70fa5a2"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.20/keirouter_v0.1.20_linux_amd64.tar.gz"
      sha256 "9596630ad514b238ac1ad0bb634c7c78b47ebe9600494a11b79863f28d7a4f0d"
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

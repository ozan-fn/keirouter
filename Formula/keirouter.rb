# Auto-updated by release.yml on tag v0.1.26. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.26"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_darwin_arm64.tar.gz"
      sha256 "506e554ed2d59b34449890ba6d5ab5f316c6636b8361b5c978247ab89f6a2b62"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_darwin_amd64.tar.gz"
      sha256 "776cdb563c98546a4a9b4f2a96a05627c1dfbf3aa6bb74381f3aafac4d8674a9"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_linux_arm64.tar.gz"
      sha256 "7f8370457101e9251a014b45876724f6ba823200981c10a5dc8a4d735acf853b"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_linux_amd64.tar.gz"
      sha256 "466cfe4cbea4a419a9d36140e47bd7d19a3aa2b5d0fc6ea6d4b31eb3299fd74a"
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

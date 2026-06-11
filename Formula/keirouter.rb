# Auto-updated by release.yml on tag v0.1.11. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.11"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.11/keirouter_v0.1.11_darwin_arm64.tar.gz"
      sha256 "31d739a29b79c7e41a0682ea6c01c50fe016f3485ef9f9c7e11b3e3895060a39"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.11/keirouter_v0.1.11_darwin_amd64.tar.gz"
      sha256 "314db4ed40bda5bda0ee7ce569e681274e6388ff1227d510c74cb5b69964cd74"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.11/keirouter_v0.1.11_linux_arm64.tar.gz"
      sha256 "42f0934ac4dd3f6e736d415c183d64d224318e51459ce10ad08afff8633fb8ca"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.11/keirouter_v0.1.11_linux_amd64.tar.gz"
      sha256 "30330e11997ac731f48ad59c829d32b18f9720c064e8767ace9c5feb61ecc781"
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
        keirouter               # start server on :20180

      Dashboard: http://localhost:20180  (default password: keirouter)
    EOS
  end

  test do
    assert_match "KeiRouter", shell_output("\#{bin}/keirouter --help 2>&1", 2)
  end
end

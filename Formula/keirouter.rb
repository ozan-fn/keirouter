# Auto-updated by release.yml on tag v0.1.27. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.27"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_darwin_arm64.tar.gz"
      sha256 "2c376c793692ea2d4f4a077372d7a4f4892dee2f4c91e88e28a3e5fb7d33b104"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_darwin_amd64.tar.gz"
      sha256 "045f08e1f0a0b92c8e9e98221c685820571790a905447ecbdc2a325f119b20e5"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_linux_arm64.tar.gz"
      sha256 "46b9e95a087d2c3c1249b88bb7d1e63966689c38f9fa30cfbba096d4f7d85e1e"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_linux_amd64.tar.gz"
      sha256 "4434c651703785e94c4fae18782a48ce7a1d5097d3c57ff5966ed25d6586fbd1"
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

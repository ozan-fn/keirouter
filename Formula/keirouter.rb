# Auto-updated by release.yml on tag v0.1.26. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.26"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_darwin_arm64.tar.gz"
      sha256 "d3daf4d531fc8571df484d3256ea9a01b6d7bf3f0e508ec6f61cc4462d160d3f"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_darwin_amd64.tar.gz"
      sha256 "ffb2154ebef4dd1351f2796a2a300f89569249c0eeec43c7ab063b4e15d6dfbc"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_linux_arm64.tar.gz"
      sha256 "fff9b2b74c704ea3a45faf914428b2b523d13dd980fc222acca45bc18f553273"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.26/keirouter_v0.1.26_linux_amd64.tar.gz"
      sha256 "6b2d645238ba798dea02db486d2767f6ee71d8599118dfb35dba74984b826912"
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

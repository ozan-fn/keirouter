# Auto-updated by release.yml on tag v0.1.27. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.27"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_darwin_arm64.tar.gz"
      sha256 "66d57dc23af380a53ecac638c9874e5155f75e4dcac33f34b28fbb69c1ec3bec"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_darwin_amd64.tar.gz"
      sha256 "b587a3cd5d2ca249abea1c14907672309fe127901e412c0a8eeb2339626b3980"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_linux_arm64.tar.gz"
      sha256 "c4b2100e715d1680cdf8c99f2b4431423c58d8e8538b4b5edc4a0c5889d77b03"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.27/keirouter_v0.1.27_linux_amd64.tar.gz"
      sha256 "c46795831b56322b0194cd1ff76fe355d6961cf323112cc2386c43151f852fac"
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

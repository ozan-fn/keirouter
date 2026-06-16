# Auto-updated by release.yml on tag v0.1.16. Do not edit manually.
class Keirouter < Formula
  desc "AI API router — unified gateway for 20+ LLM providers with fallback, caching, and dashboard"
  homepage "https://github.com/mydisha/keirouter"
  version "0.1.16"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.16/keirouter_v0.1.16_darwin_arm64.tar.gz"
      sha256 "2750af383dc244a1cc6cc15d8d35de622f6eb6a5d27741340fb99a2efbefed60"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.16/keirouter_v0.1.16_darwin_amd64.tar.gz"
      sha256 "8cf1916064ca1d5926a4b47af185608ed56d73941c289624957f7bd9c34e2531"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.16/keirouter_v0.1.16_linux_arm64.tar.gz"
      sha256 "14f57aac54fdf3b7cd400fd64a5c6f4160a58ebcd79b73eb2e6ae52def810efd"
    else
      url "https://github.com/mydisha/keirouter/releases/download/v0.1.16/keirouter_v0.1.16_linux_amd64.tar.gz"
      sha256 "78fc8ae57eadf740e094b29e6dcee9aa792b24c1963ea68368bbe0068a441e6e"
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

# mika-links — スプレッドシート駆動の固定リンク（ウミノさん方式）

配る場所には「固定URL」だけを貼り、転送先はスプレッドシートで管理する仕組み。
クーポンを更新する日は、スプシの1セルを書き換えるだけで、全部の貼り先が新しいリンクに繋がる。

## 仕組み

```
読者がクリック: https://<サイト名>.netlify.app/udemy
        ↓
Netlify Function がスプシ「転送」シートを読む（リンク共有・匿名閲覧可）
        ↓
udemy の行の転送先URLへ 302 リダイレクト
```

- 管理スプシ: https://docs.google.com/spreadsheets/d/1EY9njbOHx-ueanqZ7PfmZJtRlzxlcxRHe31nYTZWc24/edit
- 行を足せばリンクは何個でも増やせる（スラッグ＝URLの末尾）
- デプロイし直し不要。スプシを保存した瞬間から新しい転送先が効く

## 初回セットアップ（みかさん・5分・1回だけ）

1. https://app.netlify.com/ → 「Sign up」→ **GitHubでログイン**
2. 「Add new site」→「Import an existing project」→ GitHub → このリポ（mika-links）を選択
3. 設定はそのまま「Deploy」（ビルドコマンド等は空でOK）
4. できたURL（https://◯◯.netlify.app）の末尾に /udemy を付けて動作確認

### あとで（任意）: 独自ドメイン
Netlifyの Domain settings で `links.voice-mika.com` を追加 → DNSにCNAMEを1行足すと
`https://links.voice-mika.com/udemy` になる（見た目最強）。

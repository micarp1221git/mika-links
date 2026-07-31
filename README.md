# mika-links — スプレッドシート駆動の固定リンク（ウミノさん方式）

配る場所には「固定URL」だけを貼り、転送先はスプレッドシートで管理する仕組み。
クーポンを更新する日は、スプシの1セルを書き換えるだけで、全部の貼り先が新しいリンクに繋がる。

## 仕組み

```
/udemy       → Udemyコースのクーポンまとめページを自動生成
               （スプシ「udemy一覧」シートから毎回作る＝いつでも最新）
/<スラッグ>  → スプシ「転送」シートの転送先URLへ 302 リダイレクト
```

「udemy一覧」シートは、みかさんのUdemyまとめスプシ（非公開・ウミノさん式）から
毎日4時にGASが必要3列（コース名・クーポンリンク・サムネ）だけを自動コピーしたもの。
元のスプシでクーポンを更新→翌朝には（すぐ反映したい日はGASのmirrorUdemyCouponsを実行→即）このページも最新になる。

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

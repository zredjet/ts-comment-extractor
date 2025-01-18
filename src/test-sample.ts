/**
 * サンプル関数1
 * @param name 名前パラメータ
 * @returns 挨拶文
 */
function greet(name: string): string {
    return `Hello, ${name}!`;
}

/**
 * サンプル関数2
 * @param a 最初の数値
 * @param b 2番目の数値
 * @returns 計算結果
 * @throws エラーメッセージ
 */
function calculate(a: number, b: number): number {
    if (b === 0) {
        throw new Error('0での除算はできません');
    }
    return a / b;
}

/**
 * 複数行コメントのサンプル関数
 * @description
 * この関数は複数行の
 * コメントを含む
 * サンプルです
 * @param text 入力テキスト
 * @returns 処理結果
 */
function multiLineExample(text: string): string {
    return text.toUpperCase();
}

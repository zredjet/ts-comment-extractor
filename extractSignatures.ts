import * as fs from 'fs';
import * as ts from 'typescript';

function extractFunctionSignatures(filePath: string) {
    // ファイルを読み込む
    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath).toString(),
        ts.ScriptTarget.ES2015,
    /*setParentNodes */ true
    );

    // 関数を訪れるビジター関数
    function visit(node: ts.Node) {
        if (ts.isFunctionDeclaration(node) && node.name) {
            // 関数名を取得
            const functionName = node.name.getText();

            // コメントの取得
            const comments = getLeadingComments(sourceFile.getFullText(), node.getFullStart());

            // 関数名とコメントを出力
            console.log(`Function: ${functionName}`);
            if (comments) {
                const annotations = extractAnnotations(comments, ['@param', '@returns']);
                console.log(`Annotations:\n${annotations}`);
            } else {
                console.log(`Annotations: No annotations found.`);
            }
            console.log('---');
        }

        // 子ノードを再帰的に訪れる
        ts.forEachChild(node, visit);
    }

    // ノードから先行するコメントを取得する関数
    function getLeadingComments(text: string, pos: number): string | undefined {
        const comments = ts.getLeadingCommentRanges(text, pos);
        if (comments) {
            return comments.map(comment =>
                text.substring(comment.pos, comment.end)
            ).join('\n');
        }
        return undefined;
    }

    // コメントから特定のアノテーションを抽出する関数
    function extractAnnotations(comments: string, annotations: string[]): string {
        const lines = comments.split('\n');
        const result: string[] = [];
        let capture = false;
        let currentAnnotation = '';

        for (const line of lines) {
            if (annotations.some(annotation => line.includes(annotation))) {
                if (capture) {
                    result.push(currentAnnotation);
                    currentAnnotation = '';
                }
                capture = true;
            }

            if (capture) {
                currentAnnotation += line.trim() + '\n';
            }
        }

        if (capture && currentAnnotation) {
            result.push(currentAnnotation);
        }

        return result.join('\n');
    }

    // ASTを巡回
    visit(sourceFile);
}

// コマンドライン引数からファイルパスを取得
const filePath: string | undefined = process.argv[2];
if (filePath !== undefined) {
    extractFunctionSignatures(filePath);
} else {
    console.error('Please provide a file path as an argument.');
}
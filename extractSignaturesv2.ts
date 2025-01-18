import * as fs from 'fs';
import * as ts from 'typescript';
import { promisify } from 'util';

// 型定義とインターフェース
export interface AnnotationConfig {
    supportedAnnotations: string[]; // サポートするアノテーションの種類
    multiLineSupport: boolean;      // 複数行アノテーションのサポート有無
    encoding?: BufferEncoding;      // ファイルエンコーディング
}

export interface FunctionMetadata {
    name: string;      // 関数名
    annotations: AnnotationMetadata[]; // アノテーション情報
    location: {        // 関数の位置情報
        line: number;  // 行番号
        column: number;// 列番号
    };
}

export interface AnnotationMetadata {
    type: string;      // アノテーションの種類（@paramなど）
    content: string;   // アノテーションの内容
    isMultiLine: boolean; // 複数行かどうか
}

/**
 * パーサー固有のエラーを扱うためのカスタムエラークラス
 */
export class ParserError extends Error {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'ParserError';
    }
}

/**
 * TypeScriptソースファイルのパーサーメインクラス
 * ソースファイルから関数シグネチャとアノテーションを抽出する
 */
export class TypeScriptParser {
    // デフォルト設定
    private readonly defaultConfig: AnnotationConfig = {
        supportedAnnotations: ['@param', '@returns', '@throws'],
        multiLineSupport: true,
        encoding: 'utf-8'
    };

    constructor(private config: Partial<AnnotationConfig> = {}) {
        this.config = { ...this.defaultConfig, ...config };
    }

    /**
     * TypeScriptファイルから関数シグネチャを解析する
     * @param filePath TypeScriptファイルのパス
     * @returns 関数メタデータの配列
     * @throws ParserError ファイルの読み込みまたは解析に失敗した場合
     */
    public async parseFunctionSignatures(filePath: string): Promise<FunctionMetadata[]> {
        try {
            const fileContent = await this.readFile(filePath);
            const sourceFile = this.createSourceFile(filePath, fileContent);
            return this.extractFunctions(sourceFile);
        } catch (error) {
            throw new ParserError(
                `ファイル ${filePath} の関数シグネチャの解析に失敗しました`,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * ファイルの内容を適切なエラー処理とともに読み込む
     * @private
     */
    private async readFile(filePath: string): Promise<string> {
        try {
            const readFileAsync = promisify(fs.readFile);
            const buffer = await readFileAsync(filePath);
            return buffer.toString(this.config.encoding);
        } catch (error) {
            throw new ParserError(
                `ファイルの読み込みに失敗しました: ${filePath}`,
                error instanceof Error ? error : undefined
            );
        }
    }

    /**
     * TypeScriptのソースファイルオブジェクトを作成
     * @private
     */
    private createSourceFile(filePath: string, content: string): ts.SourceFile {
        return ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.ES2015,
            true
        );
    }

    /**
     * ソースファイルから関数情報を抽出
     * @private
     */
    private extractFunctions(sourceFile: ts.SourceFile): FunctionMetadata[] {
        const functions: FunctionMetadata[] = [];
        
        // ASTを再帰的に走査する
        const visit = (node: ts.Node) => {
            if (ts.isFunctionDeclaration(node) && node.name) {
                const functionData = this.processFunctionDeclaration(node, sourceFile);
                if (functionData) {
                    functions.push(functionData);
                }
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return functions;
    }

    /**
     * 個々の関数宣言を処理
     * @private
     */
    private processFunctionDeclaration(
        node: ts.FunctionDeclaration,
        sourceFile: ts.SourceFile
    ): FunctionMetadata | null {
        if (!node.name) return null;

        // 関数の位置情報を取得
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const comments = this.getLeadingComments(sourceFile.getFullText(), node.getFullStart());
        
        return {
            name: node.name.getText(),
            annotations: this.parseAnnotations(comments),
            location: {
                line: line + 1,
                column: character + 1
            }
        };
    }

    /**
     * ノードの先行コメントを取得
     * @private
     */
    private getLeadingComments(text: string, pos: number): string {
        const comments = ts.getLeadingCommentRanges(text, pos);
        if (!comments) return '';

        return comments
            .map(comment => text.substring(comment.pos, comment.end))
            .join('\n');
    }

    /**
     * コメントからアノテーションを解析
     * @private
     */
    private parseAnnotations(comments: string): AnnotationMetadata[] {
        if (!comments) return [];

        const annotationParser = new AnnotationParser(this.config);
        return annotationParser.parse(comments);
    }
}

/**
 * JSDocスタイルのアノテーションを解析するクラス
 */
export class AnnotationParser {
    private config: AnnotationConfig;

    constructor(config: Partial<AnnotationConfig>) {
        this.config = {
            supportedAnnotations: config.supportedAnnotations || [],
            multiLineSupport: config.multiLineSupport ?? true,
            encoding: config.encoding
        };
    }

    /**
     * コメント文字列からアノテーションを解析
     * @param comments 解析対象のコメント文字列
     */
    public parse(comments: string): AnnotationMetadata[] {
        const lines = comments.split('\n');
        const annotations: AnnotationMetadata[] = [];
        let currentAnnotation: Partial<AnnotationMetadata> | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim()
                .replace(/^[/*\s]+/, '')  // 行頭の * / とスペースを削除
                .replace(/\s*\*\/$/, ''); // 行末の */ を削除
            
            // サポートされているアノテーションかチェック
            const annotationType = this.findAnnotationType(trimmedLine);
            
            if (annotationType) {
                // 前のアノテーションが存在する場合は保存
                if (currentAnnotation?.type && currentAnnotation.content) {
                    annotations.push(this.finalizeAnnotation(currentAnnotation));
                }
                
                // 新しいアノテーションを開始
                currentAnnotation = {
                    type: annotationType,
                    content: trimmedLine.substring(annotationType.length).trim(),
                    isMultiLine: false
                };
            } else if (currentAnnotation && this.config.multiLineSupport) {
                // 現在のアノテーションに行を追加
                currentAnnotation.content += '\n' + trimmedLine;
                currentAnnotation.isMultiLine = true;
            }
        }

        // 最後のアノテーションが存在する場合は追加
        if (currentAnnotation?.type && currentAnnotation.content) {
            annotations.push(this.finalizeAnnotation(currentAnnotation));
        }

        return annotations;
    }

    /**
     * 行からサポートされているアノテーションタイプを検索
     * @private
     */
    private findAnnotationType(line: string): string | null {
        return this.config.supportedAnnotations.find(annotation => 
            line.startsWith(annotation)
        ) || null;
    }

    /**
     * アノテーションオブジェクトを完成させる
     * @private
     */
    private finalizeAnnotation(annotation: Partial<AnnotationMetadata>): AnnotationMetadata {
        return {
            type: annotation.type!,
            content: annotation.content!.trim(),
            isMultiLine: annotation.isMultiLine || false
        };
    }
}

// 使用例
async function main() {
    try {
        // パーサーの初期化
        const parser = new TypeScriptParser({
            supportedAnnotations: ['@param', '@returns', '@throws', '@description'],
            multiLineSupport: true
        });

        // コマンドライン引数からファイルパスを取得
        const filePath = process.argv[2];
        if (!filePath) {
            throw new Error('ファイルパスを引数として指定してください。');
        }

        // 関数シグネチャの解析と出力
        const functions = await parser.parseFunctionSignatures(filePath);
        console.log(JSON.stringify(functions, null, 2));
    } catch (error) {
        console.error('エラー:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみmain関数を実行
if (require.main === module) {
    main();
}

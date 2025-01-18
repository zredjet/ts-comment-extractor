import * as path from 'path';
import { 
    ParserError, 
    TypeScriptParser, 
    AnnotationParser,
    FunctionMetadata,
    AnnotationMetadata
} from './extractSignaturesv2';

describe('ParserError', () => {
    it('エラーメッセージとcauseを正しく保持する', () => {
        const cause = new Error('Original error');
        const error = new ParserError('Test error message', cause);
        
        expect(error.message).toBe('Test error message');
        expect(error.cause).toBe(cause);
        expect(error.name).toBe('ParserError');
    });
});

describe('TypeScriptParser', () => {
    let parser: TypeScriptParser;
    const sampleFilePath = path.join(__dirname, 'src', 'test-sample.ts');

    beforeEach(() => {
        parser = new TypeScriptParser({
            supportedAnnotations: ['@param', '@returns', '@throws', '@description'],
            multiLineSupport: true
        });
    });

    describe('parseFunctionSignatures', () => {
        it('基本的な関数シグネチャを正しく解析する', async () => {
            const functions = await parser.parseFunctionSignatures(sampleFilePath);
            
            // greet関数のテスト
            const greetFunc = functions.find((f: FunctionMetadata) => f.name === 'greet');
            expect(greetFunc).toBeDefined();
            expect(greetFunc?.annotations).toHaveLength(2);
            expect(greetFunc?.annotations.find((a: AnnotationMetadata) => a.type === '@param')).toBeDefined();
            expect(greetFunc?.annotations.find((a: AnnotationMetadata) => a.type === '@returns')).toBeDefined();

            // calculate関数のテスト
            const calcFunc = functions.find((f: FunctionMetadata) => f.name === 'calculate');
            expect(calcFunc).toBeDefined();
            expect(calcFunc?.annotations).toHaveLength(4);
            expect(calcFunc?.annotations.find((a: AnnotationMetadata) => a.type === '@throws')).toBeDefined();
        });

        it('存在しないファイルに対してエラーを投げる', async () => {
            await expect(
                parser.parseFunctionSignatures('non-existent-file.ts')
            ).rejects.toThrow(ParserError);
        });
    });
});

describe('AnnotationParser', () => {
    let parser: AnnotationParser;

    beforeEach(() => {
        parser = new AnnotationParser({
            supportedAnnotations: ['@param', '@returns', '@throws', '@description'],
            multiLineSupport: true
        });
    });

    it('単一行のアノテーションを正しく解析する', () => {
        const comment = '/** @param name ユーザー名 */';
        const annotations = parser.parse(comment);

        expect(annotations).toHaveLength(1);
        expect(annotations[0]).toEqual({
            type: '@param',
            content: 'name ユーザー名',
            isMultiLine: false
        });
    });

    it('複数行のアノテーションを正しく解析する', () => {
        const comment = `/**
         * @description
         * これは複数行の
         * 説明です
         */`;
        const annotations = parser.parse(comment);

        expect(annotations).toHaveLength(1);
        expect(annotations[0].type).toBe('@description');
        expect(annotations[0].isMultiLine).toBe(true);
        expect(annotations[0].content).toContain('これは複数行の');
        expect(annotations[0].content).toContain('説明です');
    });

    it('サポートされていないアノテーションを無視する', () => {
        const comment = `/**
         * @param name ユーザー名
         * @unsupported この注釈は無視される
         * @returns 結果
         */`;
        const annotations = parser.parse(comment);

        expect(annotations).toHaveLength(2);
        expect(annotations.map((a: AnnotationMetadata) => a.type)).toEqual(['@param', '@returns']);
    });

    it('複数のアノテーションを正しく解析する', () => {
        const comment = `/**
         * @param a 最初の数値
         * @param b 2番目の数値
         * @returns 計算結果
         * @throws エラーメッセージ
         */`;
        const annotations = parser.parse(comment);

        expect(annotations).toHaveLength(4);
        expect(annotations.map((a: AnnotationMetadata) => a.type)).toEqual([
            '@param',
            '@param',
            '@returns',
            '@throws'
        ]);
    });
});

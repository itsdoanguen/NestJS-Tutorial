import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Article } from './article.entity.js';
import { Tag } from './tag.entity.js';

@Entity('article_tags')
@Index('IDX_article_tags_tag_id', ['tagId'])
export class ArticleTag {
  @PrimaryColumn({ name: 'article_id', type: 'int' })
  articleId: number;

  @PrimaryColumn({ name: 'tag_id', type: 'int' })
  tagId: number;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: Article;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}

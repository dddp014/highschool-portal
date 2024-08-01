import { Request, Response } from "express";
import { Comment } from "../entities/Comment";
import AppDataSource from "../config/ormconfig";

export class CommentController {
  // 댓글 생성
  static createComment = async (req: Request, res: Response) => {
    const { userId, postId, content, season } = req.body;
    const commentRepository = AppDataSource.getRepository(Comment);

    const newComment = commentRepository.create({
      userId,
      postId,
      content,
    });

    try {
      await commentRepository.save(newComment);
      res.status(201).json(newComment);
    } catch (error) {
      console.error(error);
      res.status(400).json({ message: "댓글 생성 실패" });
    }
  };

  // 모든 댓글 조회
  static getAllComments = async (req: Request, res: Response) => {
    const commentRepository = AppDataSource.getRepository(Comment);

    try {
      const comments = await commentRepository.find();
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "댓글 조회 실패" });
    }
  };

  // 특정 댓글 조회
  static getCommentById = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const commentRepository = AppDataSource.getRepository(Comment);

    try {
      const comment = await commentRepository.findOne({ where: { id } });
      if (comment) {
        res.json(comment);
      } else {
        res.status(404).json({ message: "댓글을 찾을 수 없습니다" });
      }
    } catch (error) {
      res.status(500).json({ message: "댓글 조회 실패" });
    }
  };

  // 댓글 수정
  static updateComment = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const { content } = req.body;
    const commentRepository = AppDataSource.getRepository(Comment);

    try {
      const comment = await commentRepository.findOne({ where: { id } });
      if (comment) {
        comment.content = content;
        await commentRepository.save(comment);
        res.json(comment);
      } else {
        res.status(404).json({ message: "댓글을 찾을 수 없습니다" });
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({ message: "댓글 수정 실패" });
    }
  };

  // 댓글 삭제
  static deleteComment = async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    const commentRepository = AppDataSource.getRepository(Comment);

    try {
      const comment = await commentRepository.findOne({ where: { id } });
      if (comment) {
        await commentRepository.remove(comment);
        res.status(204).send();
      } else {
        res.status(404).json({ message: "댓글을 찾을 수 없습니다" });
      }
    } catch (error) {
      res.status(500).json({ message: "댓글 삭제 실패" });
    }
  };
}
